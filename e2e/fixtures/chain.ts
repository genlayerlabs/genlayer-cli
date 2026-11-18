/**
 * Ephemeral anvil fixture for the Tier-2 anvil lanes.
 *
 * Boots a private `anvil` on a random port, deploys the recording StakingStub
 * (e2e/fixtures/StakingStub.sol) with anvil dev key #0, and exposes the RPC +
 * signer + stub address. Deterministic: anvil auto-mines instantly and the key
 * is the well-known anvil account #0, so there is no live-network flakiness.
 */
import {spawn, type ChildProcess} from "node:child_process";
import {createWalletClient, createPublicClient, http, type Hex} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname, resolve} from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** anvil dev account #0 (public, well-known test key — never used off-anvil). */
export const ANVIL_KEY_0 =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
export const ANVIL_ADDRESS_0 = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;

const STUB_ARTIFACT = JSON.parse(
  readFileSync(resolve(__dirname, "StakingStub.json"), "utf-8"),
) as {abi: unknown[]; bytecode: Hex};

export interface AnvilHandle {
  rpcUrl: string;
  port: number;
  chainId: number;
  account: {address: `0x${string}`; privateKey: `0x${string}`};
  /** Deployed StakingStub address (the validator-join target). */
  stubAddress: `0x${string}`;
  stop: () => Promise<void>;
}

function makeChain(chainId: number, rpcUrl: string) {
  return {
    id: chainId,
    name: `anvil-e2e-${chainId}`,
    nativeCurrency: {name: "Ether", symbol: "ETH", decimals: 18},
    rpcUrls: {default: {http: [rpcUrl]}},
  } as const;
}

/** Boot anvil, wait until it is listening, deploy the stub, return the handle. */
export async function startAnvil(opts: {chainId: number}): Promise<AnvilHandle> {
  const child: ChildProcess = spawn(
    "anvil",
    ["--port", "0", "--chain-id", String(opts.chainId), "--accounts", "3"],
    {stdio: ["ignore", "pipe", "pipe"]},
  );

  const port = await new Promise<number>((resolvePort, reject) => {
    const timer = setTimeout(() => reject(new Error("anvil did not report a port within 15s")), 15_000);
    let buf = "";
    const onData = (chunk: Buffer) => {
      buf += chunk.toString();
      const m = buf.match(/Listening on 127\.0\.0\.1:(\d+)/);
      if (m) {
        clearTimeout(timer);
        child.stdout?.off("data", onData);
        resolvePort(Number(m[1]));
      }
    };
    child.stdout?.on("data", onData);
    child.once("error", err => {
      clearTimeout(timer);
      reject(err);
    });
    child.once("exit", code => {
      clearTimeout(timer);
      reject(new Error(`anvil exited early (code ${code})`));
    });
  });

  const rpcUrl = `http://127.0.0.1:${port}`;
  const account = privateKeyToAccount(ANVIL_KEY_0);
  const chain = makeChain(opts.chainId, rpcUrl);

  const walletClient = createWalletClient({account, chain, transport: http(rpcUrl)});
  const publicClient = createPublicClient({chain, transport: http(rpcUrl)});

  // Deploy the recording stub.
  const deployHash = await walletClient.deployContract({
    abi: STUB_ARTIFACT.abi as never,
    bytecode: STUB_ARTIFACT.bytecode,
    account,
    chain,
  });
  const deployReceipt = await publicClient.waitForTransactionReceipt({hash: deployHash});
  const stubAddress = deployReceipt.contractAddress;
  if (!stubAddress) throw new Error("StakingStub deployment produced no contract address");

  const stop = async (): Promise<void> => {
    await new Promise<void>(res => {
      if (child.exitCode !== null || child.signalCode) return res();
      child.once("exit", () => res());
      child.kill("SIGKILL");
      // Safety net if the exit event never fires.
      setTimeout(() => res(), 2000);
    });
  };

  return {
    rpcUrl,
    port,
    chainId: opts.chainId,
    account: {address: ANVIL_ADDRESS_0, privateKey: ANVIL_KEY_0},
    stubAddress: stubAddress as `0x${string}`,
    stop,
  };
}

const STUB_READ_ABI = [
  {name: "callCount", type: "function", stateMutability: "view", inputs: [], outputs: [{type: "uint256"}]},
] as const;

/** Read the StakingStub's recorded validator-join count. */
export async function readStubCallCount(anvil: AnvilHandle): Promise<number> {
  const client = createPublicClient({
    chain: makeChain(anvil.chainId, anvil.rpcUrl),
    transport: http(anvil.rpcUrl),
  });
  const count = await client.readContract({
    address: anvil.stubAddress,
    abi: STUB_READ_ABI,
    functionName: "callCount",
  });
  return Number(count);
}

/** Assert a tx mined successfully on the anvil chain. */
export async function receiptSucceeded(anvil: AnvilHandle, hash: `0x${string}`): Promise<boolean> {
  const client = createPublicClient({
    chain: makeChain(anvil.chainId, anvil.rpcUrl),
    transport: http(anvil.rpcUrl),
  });
  const receipt = await client.getTransactionReceipt({hash});
  return receipt.status === "success";
}
