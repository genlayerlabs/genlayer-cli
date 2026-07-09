import {describe, test, expect, beforeEach, afterEach, vi} from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {ConfigFileManager} from "../../src/lib/config/ConfigFileManager";
import {BrowserWalletBridge} from "../../src/lib/wallet/browserBridge";
import {resolveBrowserWalletSession} from "../../src/lib/wallet/sessionResolver";
import {
  descriptorPath,
  readDescriptor,
  writeDescriptor,
  type WalletSessionDescriptor,
} from "../../src/lib/wallet/sessionDescriptor";

const ADDRESS = "0xConnected0000000000000000000000000000001" as `0x${string}`;

const CHAIN: any = {
  id: 4221,
  name: "Genlayer Bradbury Testnet",
  rpcUrls: {default: {http: ["https://rpc.example"]}},
  nativeCurrency: {name: "GEN Token", symbol: "GEN", decimals: 18},
  blockExplorers: {default: {url: "https://explorer.example"}},
};

function parse(url: string) {
  const u = new URL(url);
  return {origin: `${u.protocol}//${u.host}`, token: new URLSearchParams(u.hash.slice(1)).get("s")!, port: Number(u.port)};
}

describe("resolveBrowserWalletSession", () => {
  let dir: string;
  let cfg: ConfigFileManager;
  let bridge: BrowserWalletBridge | null;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "gl-resolver-"));
    cfg = new ConfigFileManager(dir);
    bridge = null;
  });
  afterEach(async () => {
    await bridge?.close().catch(() => {});
    fs.rmSync(dir, {recursive: true, force: true});
  });

  /** Start a persistent bridge, write its descriptor, connect the wallet. */
  async function liveDaemon(chainId = 4221): Promise<WalletSessionDescriptor> {
    bridge = new BrowserWalletBridge({
      chain: {chainId, chainName: "c", rpcUrls: ["r"], nativeCurrency: {name: "n", symbol: "s", decimals: 18}},
      handleSigint: false,
      persistent: true,
      // Mocked — never call the real `open` (would pop/orphan a browser tab).
      openUrl: async () => undefined,
    });
    const {url} = await bridge.start();
    const {origin, token, port} = parse(url);
    await fetch(`${origin}/api/connected`, {
      method: "POST",
      headers: {"X-Bridge-Token": token, "Content-Type": "application/json", Origin: origin},
      body: JSON.stringify({address: ADDRESS}),
    });
    const d: WalletSessionDescriptor = {
      version: 1,
      pid: process.pid,
      port,
      token,
      address: ADDRESS,
      chainId,
      network: "testnet-bradbury",
      rpcUrl: "https://rpc.example",
      createdAt: Date.now(),
      lastUsed: Date.now(),
    };
    writeDescriptor(descriptorPath(cfg), d);
    return d;
  }

  test("live session → remote session", async () => {
    await liveDaemon();
    const session = await resolveBrowserWalletSession({
      chain: CHAIN,
      rpcUrl: "https://rpc.example",
      configManager: cfg,
      fallback: "error",
      pollIntervalMs: 20,
    } as any);
    expect(session.kind).toBe("remote");
    expect(session.signerAddress).toBe(ADDRESS);
  });

  test("stale descriptor → cleaned up → error fallback throws", async () => {
    // Descriptor with a dead pid / dead port.
    writeDescriptor(descriptorPath(cfg), {
      version: 1,
      pid: 0x3fffffff,
      port: 1,
      token: "x",
      address: null,
      chainId: 4221,
      network: "testnet-bradbury",
      rpcUrl: "https://rpc.example",
      createdAt: Date.now(),
      lastUsed: Date.now(),
    });
    await expect(
      resolveBrowserWalletSession({
        chain: CHAIN,
        rpcUrl: "https://rpc.example",
        configManager: cfg,
        fallback: "error",
      }),
    ).rejects.toThrow(/wallet connect/i);
    // Stale descriptor removed.
    expect(readDescriptor(descriptorPath(cfg))).toBeNull();
  });

  test("chain mismatch throws the exact switch error", async () => {
    await liveDaemon(9999); // different chain than CHAIN.id (4221)
    await expect(
      resolveBrowserWalletSession({
        chain: CHAIN,
        rpcUrl: "https://rpc.example",
        configManager: cfg,
        fallback: "error",
      }),
    ).rejects.toThrow(/connected to .* but this command targets .* Run 'genlayer wallet connect/s);
  });

  test("auto-start degrades to own-bridge when spawn fails", async () => {
    const openUrl = vi.fn().mockResolvedValue(undefined);
    const logWarning = vi.fn();
    // spawnFn that "succeeds" but no daemon ever appears → waitForDaemonReady times out.
    const spawnFn = vi.fn().mockReturnValue({pid: 4242, unref: vi.fn()});

    const resolvePromise = resolveBrowserWalletSession({
      chain: CHAIN,
      rpcUrl: "https://rpc.example",
      configManager: cfg,
      fallback: "auto-start",
      openUrl,
      handleSigint: false,
      spawnFn,
      logWarning,
      readyTimeoutMs: 300,
    });

    // The own-bridge fallback opens a real bridge and waits for connection.
    // Give the daemon-ready poll a moment to time out, then satisfy the bridge.
    // Shorten by connecting via the opened bridge URL.
    // We can't easily reach the bridge URL here, so just assert it degrades by
    // resolving the promise after we connect through openUrl's captured URL.
    await vi.waitFor(() => expect(openUrl).toHaveBeenCalled(), {timeout: 15000});
    const url = openUrl.mock.calls[0][0] as string;
    const {origin, token} = parse(url);
    await fetch(`${origin}/api/connected`, {
      method: "POST",
      headers: {"X-Bridge-Token": token, "Content-Type": "application/json", Origin: origin},
      body: JSON.stringify({address: ADDRESS}),
    });
    const session = await resolvePromise;
    expect(session.kind).toBe("local");
    expect(logWarning).toHaveBeenCalled();
    await session.close();
  }, 20000);

  test("error mode with no descriptor throws the connect-first message", async () => {
    await expect(
      resolveBrowserWalletSession({
        chain: CHAIN,
        rpcUrl: "https://rpc.example",
        configManager: cfg,
        fallback: "error",
      }),
    ).rejects.toThrow(/Run 'genlayer wallet connect' first/);
  });
});
