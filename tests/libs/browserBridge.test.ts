import {describe, test, expect, vi, beforeEach, afterEach} from "vitest";
import {BrowserWalletBridge, type BridgeChainParams} from "../../src/lib/wallet/browserBridge";

const CHAIN: BridgeChainParams = {
  chainId: 4221,
  chainName: "Genlayer Bradbury Testnet",
  rpcUrls: ["https://rpc.example"],
  nativeCurrency: {name: "GEN Token", symbol: "GEN", decimals: 18},
  blockExplorerUrls: ["https://explorer.example"],
};

const ADDRESS = "0xConnectedAddress0000000000000000000000000" as `0x${string}`;

/** Parse origin + token out of the bridge URL (http://127.0.0.1:<port>/#s=<token>). */
function parse(url: string): {origin: string; token: string} {
  const u = new URL(url);
  const origin = `${u.protocol}//${u.host}`;
  const token = new URLSearchParams(u.hash.slice(1)).get("s")!;
  return {origin, token};
}

const activeBridges: BrowserWalletBridge[] = [];

function makeBridge(overrides: Partial<ConstructorParameters<typeof BrowserWalletBridge>[0]> = {}) {
  const openUrl = vi.fn().mockResolvedValue(undefined);
  const bridge = new BrowserWalletBridge({
    chain: CHAIN,
    openUrl,
    handleSigint: false,
    ...overrides,
  });
  activeBridges.push(bridge);
  return {bridge, openUrl};
}

describe("BrowserWalletBridge", () => {
  let bridge: BrowserWalletBridge;
  let origin: string;
  let token: string;
  let openUrl: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    activeBridges.length = 0;
    ({bridge, openUrl} = makeBridge());
    const {url} = await bridge.start();
    ({origin, token} = parse(url));
  });

  afterEach(async () => {
    // Close every bridge a test created so no server / pending promise leaks.
    await Promise.all(activeBridges.map(b => b.close().catch(() => {})));
    activeBridges.length = 0;
  });

  const authGet = (path: string) => fetch(`${origin}${path}`, {headers: {"X-Bridge-Token": token}});
  const authPost = (path: string, body: unknown) =>
    fetch(`${origin}${path}`, {
      method: "POST",
      headers: {"X-Bridge-Token": token, "Content-Type": "application/json", Origin: origin},
      body: JSON.stringify(body),
    });

  test("start() binds loopback, opens the URL, and serves the page", async () => {
    expect(origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(openUrl).toHaveBeenCalledOnce();
    const res = await fetch(`${origin}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("GenLayer CLI");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  test("/api/session returns chain params incl. chainIdHex", async () => {
    const res = await authGet("/api/session");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.chain.chainId).toBe(4221);
    expect(body.chain.chainIdHex).toBe("0x107d");
    expect(body.chain.chainName).toBe(CHAIN.chainName);
  });

  test("rejects API calls with a missing or wrong token (403)", async () => {
    const noToken = await fetch(`${origin}/api/session`);
    expect(noToken.status).toBe(403);
    const badToken = await fetch(`${origin}/api/session`, {headers: {"X-Bridge-Token": "nope"}});
    expect(badToken.status).toBe(403);
  });

  test("rejects a POST with a wrong Origin header (403)", async () => {
    const res = await fetch(`${origin}/api/connected`, {
      method: "POST",
      headers: {"X-Bridge-Token": token, "Content-Type": "application/json", Origin: "http://evil.example"},
      body: JSON.stringify({address: ADDRESS}),
    });
    expect(res.status).toBe(403);
  });

  test("connected handshake resolves waitForConnection()", async () => {
    const connectionPromise = bridge.waitForConnection();
    await authPost("/api/connected", {address: ADDRESS});
    await expect(connectionPromise).resolves.toBe(ADDRESS);
  });

  test("full happy path: connect -> next(tx) -> result(sent) -> hash", async () => {
    await authPost("/api/connected", {address: ADDRESS});
    await bridge.waitForConnection();

    const sendPromise = bridge.sendTransaction({
      to: "0xStaking00000000000000000000000000000000" as `0x${string}`,
      data: "0xabcdef" as `0x${string}`,
      value: 100n,
      label: "Join as validator",
    });

    const nextRes = await authGet("/api/next");
    const next = await nextRes.json();
    expect(next.type).toBe("tx");
    expect(next.tx.to).toBe("0xStaking00000000000000000000000000000000");
    expect(next.tx.value).toBe("0x64"); // 100 in hex
    expect(next.tx.chainId).toBe("0x107d");
    expect(next.tx.label).toBe("Join as validator");

    await authPost("/api/result", {id: next.tx.id, status: "sent", txHash: "0xhash", from: ADDRESS});
    await expect(sendPromise).resolves.toBe("0xhash");
  });

  test("serializes gas/type/nonce pass-through as hex quantities when present", async () => {
    await authPost("/api/connected", {address: ADDRESS});
    const sendPromise = bridge.sendTransaction({
      to: "0xConsensus" as any,
      data: "0xdead" as `0x${string}`,
      value: 100n,
      gas: 21000n,
      gasPrice: 1n,
      nonce: 2,
      type: "0x0",
      label: "IC write",
    });
    const next = await (await authGet("/api/next")).json();
    expect(next.tx.gas).toBe("0x5208"); // 21000
    expect(next.tx.gasPrice).toBe("0x1");
    expect(next.tx.nonce).toBe("0x2");
    expect(next.tx.type).toBe("0x0");
    await authPost("/api/result", {id: next.tx.id, status: "sent", txHash: "0xh"});
    await expect(sendPromise).resolves.toBe("0xh");
  });

  test("omits gas/type/nonce when absent (backward compatible)", async () => {
    await authPost("/api/connected", {address: ADDRESS});
    const sendPromise = bridge.sendTransaction({to: "0xA" as any, data: "0x01", label: "bare"});
    const next = await (await authGet("/api/next")).json();
    expect(next.tx.gas).toBeUndefined();
    expect(next.tx.type).toBeUndefined();
    expect(next.tx.nonce).toBeUndefined();
    await authPost("/api/result", {id: next.tx.id, status: "sent", txHash: "0xh2"});
    await expect(sendPromise).resolves.toBe("0xh2");
  });

  test("multi-tx sequential: two sends delivered and resolved in order", async () => {
    await authPost("/api/connected", {address: ADDRESS});

    const p1 = bridge.sendTransaction({to: "0xA" as any, data: "0x01", label: "tx1"});
    const n1 = await (await authGet("/api/next")).json();
    expect(n1.tx.label).toBe("tx1");
    await authPost("/api/result", {id: n1.tx.id, status: "sent", txHash: "0xhash1"});
    await expect(p1).resolves.toBe("0xhash1");

    const p2 = bridge.sendTransaction({to: "0xB" as any, data: "0x02", label: "tx2"});
    const n2 = await (await authGet("/api/next")).json();
    expect(n2.tx.label).toBe("tx2");
    await authPost("/api/result", {id: n2.tx.id, status: "sent", txHash: "0xhash2"});
    await expect(p2).resolves.toBe("0xhash2");
  });

  test("long-poll returns {type:'none'} then a tx when queued (deliver via waiter)", async () => {
    ({bridge, openUrl} = makeBridge({txTimeoutMs: 2000}));
    const {url} = await bridge.start();
    ({origin, token} = parse(url));

    // Start a poll BEFORE any tx is queued — it should be held.
    const pollPromise = authGet("/api/next").then(r => r.json());
    // Queue a tx; the held waiter must be resolved with it.
    const sendPromise = bridge.sendTransaction({to: "0xC" as any, data: "0x03", label: "held-tx"});
    const held = await pollPromise;
    expect(held.type).toBe("tx");
    expect(held.tx.label).toBe("held-tx");
    await authPost("/api/result", {id: held.tx.id, status: "sent", txHash: "0xheld"});
    await expect(sendPromise).resolves.toBe("0xheld");
  });

  test("rejected result rejects sendTransaction with a clear message", async () => {
    await authPost("/api/connected", {address: ADDRESS});
    const sendPromise = bridge.sendTransaction({to: "0xD" as any, data: "0x04", label: "reject-me"});
    const assertion = expect(sendPromise).rejects.toThrow(/rejected in wallet/i);
    const next = await (await authGet("/api/next")).json();
    await authPost("/api/result", {id: next.tx.id, status: "rejected"});
    await assertion;
  });

  test("error result rejects with the provided message", async () => {
    await authPost("/api/connected", {address: ADDRESS});
    const sendPromise = bridge.sendTransaction({to: "0xE" as any, data: "0x05", label: "err-me"});
    const assertion = expect(sendPromise).rejects.toThrow(/insufficient funds/);
    const next = await (await authGet("/api/next")).json();
    await authPost("/api/result", {id: next.tx.id, status: "error", message: "insufficient funds"});
    await assertion;
  });

  test("sendTransaction times out when the wallet never signs", async () => {
    ({bridge} = makeBridge({txTimeoutMs: 40}));
    await bridge.start();
    const sendPromise = bridge.sendTransaction({to: "0xF" as any, data: "0x06", label: "slow"});
    await expect(sendPromise).rejects.toThrow(/Timed out waiting for the wallet to sign/);
  });

  test("waitForConnection times out when nobody connects", async () => {
    ({bridge} = makeBridge({connectTimeoutMs: 40}));
    await bridge.start();
    await expect(bridge.waitForConnection()).rejects.toThrow(/Timed out waiting for the browser wallet/);
  });

  test("done/abort messages are delivered to a polling page", async () => {
    // done
    {
      const {bridge: b} = makeBridge();
      const {url} = await b.start();
      const p = parse(url);
      const poll = fetch(`${b.getUrl().split("#")[0]}api/next`, {headers: {"X-Bridge-Token": p.token}}).then(
        r => r.json(),
      );
      await b.close("wrapped up");
      const msg = await poll;
      expect(msg.type).toBe("done");
      expect(msg.message).toBe("wrapped up");
    }
  });

  test("server is closed after close() (subsequent fetch fails)", async () => {
    const url = bridge.getUrl();
    const base = url.split("#")[0];
    await bridge.close();
    await expect(fetch(base)).rejects.toBeTruthy();
  });

  test("close() rejects a pending sendTransaction", async () => {
    await authPost("/api/connected", {address: ADDRESS});
    const sendPromise = bridge.sendTransaction({to: "0x1" as any, data: "0x07", label: "pending"});
    // Attach the rejection expectation BEFORE close() so the rejection is never
    // momentarily unhandled.
    const assertion = expect(sendPromise).rejects.toThrow(/Bridge closed/);
    await bridge.close();
    await assertion;
  });
});

describe("BrowserWalletBridge — persistent (daemon) mode", () => {
  let bridge: BrowserWalletBridge;
  let origin: string;
  let token: string;

  const authGet = (path: string) => fetch(`${origin}${path}`, {headers: {"X-Bridge-Token": token}});
  const clientPost = (path: string, body: unknown) =>
    // No Origin header — mimics a Node CLI client (must be exempt from the check).
    fetch(`${origin}${path}`, {
      method: "POST",
      headers: {"X-Bridge-Token": token, "Content-Type": "application/json"},
      body: JSON.stringify(body),
    });
  const pagePost = (path: string, body: unknown) =>
    fetch(`${origin}${path}`, {
      method: "POST",
      headers: {"X-Bridge-Token": token, "Content-Type": "application/json", Origin: origin},
      body: JSON.stringify(body),
    });

  beforeEach(async () => {
    activeBridges.length = 0;
    ({bridge} = makeBridge({persistent: true, txTimeoutMs: 5000}));
    const {url} = await bridge.start();
    ({origin, token} = parse(url));
  });

  afterEach(async () => {
    await Promise.all(activeBridges.map(b => b.close().catch(() => {})));
    activeBridges.length = 0;
  });

  test("/api/ping and /api/state require the token (403 without)", async () => {
    expect((await fetch(`${origin}/api/ping`)).status).toBe(403);
    expect((await fetch(`${origin}/api/state`)).status).toBe(403);
    expect((await authGet("/api/ping")).status).toBe(200);
  });

  test("/api/session advertises persistent:true", async () => {
    const body = await (await authGet("/api/session")).json();
    expect(body.persistent).toBe(true);
  });

  test("enqueue → page next → result → /api/tx reports done/sent/hash", async () => {
    await pagePost("/api/connected", {address: ADDRESS});
    // Prime the heartbeat with one poll so the tab is considered alive.
    // (a page just after connect polls immediately)
    const enq = await (await clientPost("/api/enqueue", {to: "0xTo", data: "0xabcd", value: "0x64", label: "L"})).json();
    expect(typeof enq.id).toBe("string");

    // Page fetches the tx and reports the result.
    const next = await (await authGet("/api/next")).json();
    expect(next.type).toBe("tx");
    expect(next.tx.to).toBe("0xTo");
    expect(next.tx.value).toBe("0x64");

    // Before result, /api/tx should be delivered (or pending).
    const mid = await (await authGet(`/api/tx?id=${enq.id}`)).json();
    expect(["pending", "delivered"]).toContain(mid.state);

    await pagePost("/api/result", {id: next.tx.id, status: "sent", txHash: "0xhash", from: ADDRESS});
    const done = await (await authGet(`/api/tx?id=${enq.id}`)).json();
    expect(done.state).toBe("done");
    expect(done.status).toBe("sent");
    expect(done.txHash).toBe("0xhash");
    expect(done.from).toBe(ADDRESS);
  });

  test("enqueue → rejected result surfaces status:rejected", async () => {
    await pagePost("/api/connected", {address: ADDRESS});
    const enq = await (await clientPost("/api/enqueue", {to: "0xA", data: "0x01", label: "r"})).json();
    const next = await (await authGet("/api/next")).json();
    await pagePost("/api/result", {id: next.tx.id, status: "rejected"});
    const done = await (await authGet(`/api/tx?id=${enq.id}`)).json();
    expect(done.state).toBe("done");
    expect(done.status).toBe("rejected");
    expect(done.message).toMatch(/rejected in wallet/i);
  });

  test("enqueue → error result surfaces status:error with message", async () => {
    await pagePost("/api/connected", {address: ADDRESS});
    const enq = await (await clientPost("/api/enqueue", {to: "0xA", data: "0x01", label: "e"})).json();
    const next = await (await authGet("/api/next")).json();
    await pagePost("/api/result", {id: next.tx.id, status: "error", message: "insufficient funds"});
    const done = await (await authGet(`/api/tx?id=${enq.id}`)).json();
    expect(done.status).toBe("error");
    expect(done.message).toBe("insufficient funds");
  });

  test("enqueue exempt from Origin check; page POST with bad Origin still 403", async () => {
    await pagePost("/api/connected", {address: ADDRESS});
    // client POST with NO origin succeeds (200).
    const ok = await clientPost("/api/enqueue", {to: "0xA", data: "0x01", label: "x"});
    expect(ok.status).toBe(200);
    // page route with wrong origin is still rejected.
    const bad = await fetch(`${origin}/api/connected`, {
      method: "POST",
      headers: {"X-Bridge-Token": token, "Content-Type": "application/json", Origin: "http://evil.example"},
      body: JSON.stringify({address: ADDRESS}),
    });
    expect(bad.status).toBe(403);
  });

  test("enqueue returns 409 wallet-not-connected before connect", async () => {
    const res = await clientPost("/api/enqueue", {to: "0xA", data: "0x01", label: "x"});
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("wallet-not-connected");
  });

  test("heartbeat: lastPagePollAt advances on /api/next", async () => {
    const before = bridge.getState().lastPagePollAt;
    // Fire a poll but do NOT await it: with nothing queued the server long-polls
    // (holds ~25s). The heartbeat is stamped synchronously at handler entry.
    void authGet("/api/next").catch(() => {});
    await new Promise(r => setTimeout(r, 50));
    const after = bridge.getState().lastPagePollAt;
    expect(after).toBeGreaterThan(before);
    expect(after).toBeGreaterThan(0);
  });

  test("two concurrent enqueues deliver strictly FIFO with independent results", async () => {
    await pagePost("/api/connected", {address: ADDRESS});
    const a = await (await clientPost("/api/enqueue", {to: "0xA", data: "0x01", label: "first"})).json();
    const b = await (await clientPost("/api/enqueue", {to: "0xB", data: "0x02", label: "second"})).json();

    const n1 = await (await authGet("/api/next")).json();
    expect(n1.tx.label).toBe("first");
    await pagePost("/api/result", {id: n1.tx.id, status: "sent", txHash: "0xh1"});

    const n2 = await (await authGet("/api/next")).json();
    expect(n2.tx.label).toBe("second");
    await pagePost("/api/result", {id: n2.tx.id, status: "sent", txHash: "0xh2"});

    expect((await (await authGet(`/api/tx?id=${a.id}`)).json()).txHash).toBe("0xh1");
    expect((await (await authGet(`/api/tx?id=${b.id}`)).json()).txHash).toBe("0xh2");
  });

  test("/api/shutdown responds ok then closes the server", async () => {
    const res = await clientPost("/api/shutdown", {});
    expect(res.status).toBe(200);
    // Server should be closing/closed shortly after.
    await new Promise(r => setTimeout(r, 120));
    await expect(fetch(`${origin}/`)).rejects.toBeTruthy();
  });

  test("enqueue is 404 on a non-persistent bridge", async () => {
    const {bridge: b} = makeBridge({persistent: false});
    const {url} = await b.start();
    const p = parse(url);
    const res = await fetch(`${p.origin}/api/enqueue`, {
      method: "POST",
      headers: {"X-Bridge-Token": p.token, "Content-Type": "application/json"},
      body: JSON.stringify({to: "0xA", data: "0x01", label: "x"}),
    });
    expect(res.status).toBe(404);
  });
});
