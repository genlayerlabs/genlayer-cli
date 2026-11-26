import {describe, test, expect, vi, beforeEach} from "vitest";

/**
 * BUG: stale `nextLabel` leaks to the next transaction after a failed send.
 *
 * src/lib/wallet/browserSend.ts (eip1193Provider `eth_sendTransaction`, ~L217-229):
 *
 *   const result = await transport.sendTransaction({ ..., label: nextLabel ?? "GenLayer transaction" });
 *   const hash = assertResultSigner(result, signerAddress);
 *   nextLabel = undefined;   // <-- only reached when the send SUCCEEDS
 *
 * `nextLabel` is cleared only after a successful send. If the wallet rejects the
 * transaction (user declines, tx error, timeout) the label survives and is
 * attached to the NEXT, unrelated transaction. The label is exactly what the
 * bridge page renders next to the wallet confirmation, so the user is shown the
 * wrong signing prompt (e.g. confirms "Deploy Counter.py" for a different call).
 *
 * Fix direction: consume the label BEFORE the send (or clear it in a finally),
 * so it never carries over past the call it was set for.
 *
 * This test FAILS on the buggy code (the second send is labelled with the stale
 * "Deploy Counter.py") and should PASS once the label is reset regardless of
 * outcome.
 */

const bridgeSend = vi.fn();
const bridgeClose = vi.fn().mockResolvedValue(undefined);
const bridgeStart = vi.fn().mockResolvedValue({url: "http://127.0.0.1:12345/#s=tok"});
const bridgeWaitForConnection = vi.fn().mockResolvedValue("0xConnected0000000000000000000000000000001");

vi.mock("../../src/lib/wallet/browserBridge", () => ({
  BrowserWalletBridge: vi.fn().mockImplementation(() => ({
    start: bridgeStart,
    waitForConnection: bridgeWaitForConnection,
    sendTransaction: bridgeSend,
    close: bridgeClose,
    getUrl: () => "http://127.0.0.1:12345/#s=tok",
  })),
}));

const publicCall = vi.fn().mockResolvedValue({data: "0x"});
const waitForReceipt = vi.fn();
vi.mock("viem", async importOriginal => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({call: publicCall, waitForTransactionReceipt: waitForReceipt})),
  };
});

import {openBrowserWalletSession} from "../../src/lib/wallet/browserSend";

const CHAIN: any = {
  id: 4221,
  name: "Genlayer Bradbury Testnet",
  rpcUrls: {default: {http: ["https://rpc.example"]}},
  nativeCurrency: {name: "GEN Token", symbol: "GEN", decimals: 18},
  blockExplorers: {default: {url: "https://explorer.example"}},
};

describe("BUG: browserSend nextLabel leaks after a failed send", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridgeStart.mockResolvedValue({url: "http://127.0.0.1:12345/#s=tok"});
    bridgeWaitForConnection.mockResolvedValue("0xConnected0000000000000000000000000000001");
    publicCall.mockResolvedValue({data: "0x"});
  });

  test("a rejected send must not carry its label into the next transaction", async () => {
    const session = await openBrowserWalletSession({chain: CHAIN, rpcUrl: "https://rpc.example"});

    // First send: the wallet rejects it. Its label must NOT survive.
    bridgeSend.mockRejectedValueOnce(new Error("User rejected the request"));
    session.setNextLabel("Deploy Counter.py");
    await expect(
      session.eip1193Provider.request({method: "eth_sendTransaction", params: [{to: "0xA", data: "0x"}]}),
    ).rejects.toThrow(/rejected/i);

    // Second, unrelated send should use the default label — NOT the stale one.
    bridgeSend.mockResolvedValueOnce("0xhash");
    await session.eip1193Provider.request({
      method: "eth_sendTransaction",
      params: [{to: "0xB", data: "0x"}],
    });

    expect(bridgeSend).toHaveBeenLastCalledWith(expect.objectContaining({label: "GenLayer transaction"}));
  });
});
