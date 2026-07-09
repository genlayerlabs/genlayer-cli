import {describe, test, expect, beforeEach, afterEach} from "vitest";
import {
  BrowserWalletBridge,
  serializeBridgeTx,
  type BridgeChainParams,
} from "../../src/lib/wallet/browserBridge";
import {WalletSessionClient} from "../../src/lib/wallet/sessionClient";
import type {WalletSessionDescriptor} from "../../src/lib/wallet/sessionDescriptor";

const CHAIN: BridgeChainParams = {
  chainId: 4221,
  chainName: "Genlayer Bradbury Testnet",
  rpcUrls: ["https://rpc.example"],
  nativeCurrency: {name: "GEN Token", symbol: "GEN", decimals: 18},
  blockExplorerUrls: ["https://explorer.example"],
};
const ADDRESS = "0xConnected0000000000000000000000000000001" as `0x${string}`;

function parse(url: string) {
  const u = new URL(url);
  return {
    origin: `${u.protocol}//${u.host}`,
    token: new URLSearchParams(u.hash.slice(1)).get("s")!,
    port: Number(u.port),
  };
}

/** A page simulator: connects, then polls /api/next and reports a fixed result. */
function drivePage(origin: string, token: string, opts: {status: string; txHash?: string; message?: string}) {
  const authGet = (p: string) => fetch(`${origin}${p}`, {headers: {"X-Bridge-Token": token}});
  const pagePost = (p: string, b: unknown) =>
    fetch(`${origin}${p}`, {
      method: "POST",
      headers: {"X-Bridge-Token": token, "Content-Type": "application/json", Origin: origin},
      body: JSON.stringify(b),
    });
  let stopped = false;
  (async () => {
    await pagePost("/api/connected", {address: ADDRESS});
    while (!stopped) {
      const next = await authGet("/api/next")
        .then(r => r.json())
        .catch(() => ({type: "stop"}));
      if (next.type === "tx") {
        await pagePost("/api/result", {id: next.tx.id, ...opts, from: ADDRESS});
      } else if (next.type === "done" || next.type === "stop") {
        break;
      }
    }
  })();
  return () => {
    stopped = true;
  };
}

describe("WalletSessionClient", () => {
  let bridge: BrowserWalletBridge;
  let descriptor: WalletSessionDescriptor;
  let stopPage: (() => void) | null = null;

  beforeEach(async () => {
    // openUrl MUST be mocked — an unmocked bridge would call the real `open`
    // package and pop (then orphan) a browser tab. In-process fake page only.
    bridge = new BrowserWalletBridge({
      chain: CHAIN,
      handleSigint: false,
      persistent: true,
      txTimeoutMs: 5000,
      openUrl: async () => undefined,
    });
    const {url} = await bridge.start();
    const {port, token} = parse(url);
    descriptor = {
      version: 1,
      pid: process.pid,
      port,
      token,
      address: null,
      chainId: 4221,
      network: "testnet-bradbury",
      rpcUrl: "https://rpc.example",
      createdAt: Date.now(),
      lastUsed: Date.now(),
    };
  });

  afterEach(async () => {
    stopPage?.();
    await bridge.close().catch(() => {});
  });

  test("ping() true against a live daemon, false on a dead port", async () => {
    const client = new WalletSessionClient(descriptor, {pollIntervalMs: 20});
    expect(await client.ping()).toBe(true);
    const dead = new WalletSessionClient({...descriptor, port: 1}, {pollIntervalMs: 20});
    expect(await dead.ping()).toBe(false);
  });

  test("waitForConnection resolves the connected signer", async () => {
    const {origin, token} = parse(bridge.getUrl());
    stopPage = drivePage(origin, token, {status: "sent", txHash: "0xhash"});
    const client = new WalletSessionClient(descriptor, {pollIntervalMs: 20});
    await expect(client.waitForConnection(3000)).resolves.toBe(ADDRESS);
  });

  test("enqueueTx + waitForTxResult round-trips a sent hash", async () => {
    const {origin, token} = parse(bridge.getUrl());
    stopPage = drivePage(origin, token, {status: "sent", txHash: "0xdeadbeef"});
    const client = new WalletSessionClient(descriptor, {pollIntervalMs: 20});
    await client.waitForConnection(3000);
    const id = await client.enqueueTx({to: "0xTo" as any, data: "0x01", value: 100n, label: "L"});
    await expect(client.waitForTxResult(id, 3000)).resolves.toBe("0xdeadbeef");
  });

  test("waitForTxResult throws on a rejected tx", async () => {
    const {origin, token} = parse(bridge.getUrl());
    stopPage = drivePage(origin, token, {status: "rejected"});
    const client = new WalletSessionClient(descriptor, {pollIntervalMs: 20});
    await client.waitForConnection(3000);
    const id = await client.enqueueTx({to: "0xTo" as any, data: "0x01", label: "L"});
    await expect(client.waitForTxResult(id, 3000)).rejects.toThrow(/rejected in wallet/i);
  });

  test("enqueueTx maps 409 wallet-not-connected to a clear error", async () => {
    // No page connected → daemon returns 409.
    const client = new WalletSessionClient(descriptor, {pollIntervalMs: 20});
    await expect(client.enqueueTx({to: "0xA" as any, data: "0x01", label: "x"})).rejects.toThrow(
      /not connected/i,
    );
  });

  test("bigint → hex round-trip equals serializeBridgeTx output", () => {
    const tx = {to: "0xA" as any, data: "0x01" as const, value: 255n, gas: 21000n, label: "L"};
    const s = serializeBridgeTx(tx);
    expect(s.value).toBe("0xff");
    expect(s.gas).toBe("0x5208");
  });

  test("waitForTxResult fails fast when the tab heartbeat is stale", async () => {
    const {origin, token} = parse(bridge.getUrl());
    // Connect but do NOT poll /api/next again; then force the heartbeat stale.
    await fetch(`${origin}/api/connected`, {
      method: "POST",
      headers: {"X-Bridge-Token": token, "Content-Type": "application/json", Origin: origin},
      body: JSON.stringify({address: ADDRESS}),
    });
    const client = new WalletSessionClient(descriptor, {pollIntervalMs: 20});
    const id = await client.enqueueTx({to: "0xA" as any, data: "0x01", label: "x"});
    // Poke a poll so lastPagePollAt becomes non-zero, then rewind it far into the past.
    void fetch(`${origin}/api/next`, {headers: {"X-Bridge-Token": token}}).catch(() => {});
    await new Promise(r => setTimeout(r, 30));
    (bridge as any).lastPagePollAt = Date.now() - 10 * 60_000;
    await expect(client.waitForTxResult(id, 3000)).rejects.toThrow(/tab appears to be closed/i);
  });
});
