import {describe, test, expect, afterEach} from "vitest";
import {BrowserWalletBridge, type BridgeChainParams} from "../../src/lib/wallet/browserBridge";

/**
 * BUG: POST /api/connected accepts an empty / malformed body and marks the
 * bridge "connected" with an empty-string address.
 *
 * src/lib/wallet/browserBridge.ts:
 *   - readJson (~L777-782): malformed JSON and an empty body both resolve to `{}`
 *     instead of rejecting, so the 400 path (handleJsonReadError) is never hit.
 *   - /api/connected handler (~L583): `const address = (body?.address ?? "") as Address;`
 *     defaults a missing address to "" and stores it unconditionally.
 *
 * Result: getState() reports `connected: true, address: ""`, but every write
 * path guards with `if (!this.connectedAddress)` (empty string is falsy) and
 * rejects with "wallet-not-connected". The session is simultaneously
 * "connected" (status/UX) and "not connected" (can't sign) — an inconsistent
 * state that surfaces as a bogus `wallet status: connected, address: ""`.
 *
 * Fix direction: reject a missing / non-`0x` address with 400 and do NOT flip
 * the connection state.
 *
 * This test FAILS on the buggy code (connected becomes true) and should PASS
 * once an empty/invalid address is rejected.
 */

const CHAIN: BridgeChainParams = {
  chainId: 4221,
  chainName: "Genlayer Bradbury Testnet",
  rpcUrls: ["https://rpc.example"],
  nativeCurrency: {name: "GEN Token", symbol: "GEN", decimals: 18},
  blockExplorerUrls: ["https://explorer.example"],
};

function parse(url: string): {origin: string; token: string} {
  const u = new URL(url);
  const origin = `${u.protocol}//${u.host}`;
  const token = new URLSearchParams(u.hash.slice(1)).get("s")!;
  return {origin, token};
}

const activeBridges: BrowserWalletBridge[] = [];

afterEach(async () => {
  await Promise.all(activeBridges.map(b => b.close().catch(() => {})));
  activeBridges.length = 0;
});

describe("BUG: /api/connected must validate the address", () => {
  test("an empty body must NOT mark the bridge connected", async () => {
    const bridge = new BrowserWalletBridge({chain: CHAIN, openUrl: async () => {}, handleSigint: false});
    activeBridges.push(bridge);
    const {url} = await bridge.start();
    const {origin, token} = parse(url);

    // Valid token + origin, but no address in the (empty) body.
    const res = await fetch(`${origin}/api/connected`, {
      method: "POST",
      headers: {"X-Bridge-Token": token, "Content-Type": "application/json", Origin: origin},
      body: "",
    });

    // The bridge must not consider itself connected with no signer address.
    expect(bridge.getState().connected).toBe(false);
    expect(bridge.getState().address).not.toBe("");
    // And it should signal the bad request rather than 200 OK.
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test("a malformed JSON body must NOT mark the bridge connected", async () => {
    const bridge = new BrowserWalletBridge({chain: CHAIN, openUrl: async () => {}, handleSigint: false});
    activeBridges.push(bridge);
    const {url} = await bridge.start();
    const {origin, token} = parse(url);

    await fetch(`${origin}/api/connected`, {
      method: "POST",
      headers: {"X-Bridge-Token": token, "Content-Type": "application/json", Origin: origin},
      body: "not-json{{{",
    });

    expect(bridge.getState().connected).toBe(false);
  });
});
