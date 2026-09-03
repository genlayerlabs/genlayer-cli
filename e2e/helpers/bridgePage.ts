/**
 * Playwright driver for the real bridge page (src/lib/wallet/bridgePage.ts).
 *
 * Launches a headless chromium, injects the mock `window.ethereum` BEFORE the
 * page loads, and wires the page's `window.__glSign` hook to a Node-side viem
 * local account that actually signs + broadcasts `eth_sendTransaction` to the
 * ephemeral anvil and returns a real tx hash. The full loop therefore runs for
 * real — bridge + served page JS + session daemon + chain — with zero human and
 * zero extension.
 */
import {chromium, type Browser, type Page} from "@playwright/test";
import {createWalletClient, http, type Hex} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {installMockProvider, type MockProviderOptions} from "../fixtures/mockProvider";
import {spawnConnect, type ScratchEnv} from "../fixtures/cli";
import type {AnvilHandle} from "../fixtures/chain";

export interface DriverOptions {
  rpcUrl: string;
  chainId: number;
  privateKey: `0x${string}`;
  behavior?: MockProviderOptions["behavior"];
}

export interface BridgeDriver {
  page: Page;
  /** Load the URL with the mock installed and click "Connect wallet". */
  connect(sessionUrl: string): Promise<void>;
  /** Close just the tab (simulates the user closing the wallet tab). */
  closePage(): Promise<void>;
  /** Tear down the whole browser. */
  close(): Promise<void>;
}

/** Launch one headless chromium; callers open a driver per session. */
export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({headless: true});
}

export async function openDriver(browser: Browser, opts: DriverOptions): Promise<BridgeDriver> {
  const page = await browser.newPage();

  const account = privateKeyToAccount(opts.privateKey);
  const chain = {
    id: opts.chainId,
    name: `anvil-e2e-${opts.chainId}`,
    nativeCurrency: {name: "Ether", symbol: "ETH", decimals: 18},
    rpcUrls: {default: {http: [opts.rpcUrl]}},
  } as const;
  const wallet = createWalletClient({account, chain, transport: http(opts.rpcUrl)});

  // Real signing happens in Node, returning a real on-chain hash.
  await page.exposeFunction(
    "__glSign",
    async (tx: {to: Hex; data?: Hex; value?: string; gas?: string}): Promise<string> => {
      const hash = await wallet.sendTransaction({
        account,
        chain,
        to: tx.to,
        data: (tx.data ?? "0x") as Hex,
        value: tx.value ? BigInt(tx.value) : undefined,
        gas: tx.gas ? BigInt(tx.gas) : undefined,
      });
      return hash;
    },
  );

  await page.addInitScript(
    installMockProvider({
      address: account.address,
      chainIdHex: `0x${opts.chainId.toString(16)}`,
      behavior: opts.behavior,
    }),
  );

  const connect = async (sessionUrl: string): Promise<void> => {
    await page.goto(sessionUrl);
    // The page shows the "Connect wallet" button once /api/session resolves.
    await page.waitForSelector("#action:not([style*='display: none'])", {timeout: 15_000});
    await page.click("#action");
  };

  return {
    page,
    connect,
    closePage: () => page.close(),
    close: () => browser.close(),
  };
}

/**
 * Full connect dance shared by the lane specs: spawn `wallet connect`, scrape
 * its URL, drive the mock page to approve, and wait for "Connected as ...".
 * Returns the live driver (keep it open so the page keeps its heartbeat) and
 * the connected signer address.
 */
export async function establishSession(
  browser: Browser,
  anvil: AnvilHandle,
  scratch: ScratchEnv,
  opts: {behavior?: MockProviderOptions["behavior"]} = {},
): Promise<{driver: BridgeDriver; address: string}> {
  const connect = spawnConnect([], scratch);
  const url = await connect.waitForUrl();
  const driver = await openDriver(browser, {
    rpcUrl: anvil.rpcUrl,
    chainId: anvil.chainId,
    privateKey: anvil.account.privateKey,
    behavior: opts.behavior,
  });
  await driver.connect(url);
  const line = await connect.waitForConnected();
  await new Promise<void>(res => connect.child.once("exit", () => res()));
  const address = line.match(/0x[0-9a-fA-F]{40}/)?.[0] ?? "";
  return {driver, address};
}
