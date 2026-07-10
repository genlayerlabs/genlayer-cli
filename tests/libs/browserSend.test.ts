import {describe, test, expect, vi, beforeEach} from "vitest";

// Mock the bridge so no real HTTP server is started.
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

// Mock viem's publicClient (preflight + receipt).
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

async function makeSession() {
  return openBrowserWalletSession({chain: CHAIN, rpcUrl: "https://rpc.example"});
}

describe("openBrowserWalletSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridgeStart.mockResolvedValue({url: "http://127.0.0.1:12345/#s=tok"});
    bridgeWaitForConnection.mockResolvedValue("0xConnected0000000000000000000000000000001");
    publicCall.mockResolvedValue({data: "0x"});
  });

  test("starts the bridge and resolves the connected signer address", async () => {
    const session = await makeSession();
    expect(bridgeStart).toHaveBeenCalledOnce();
    expect(session.signerAddress).toBe("0xConnected0000000000000000000000000000001");
  });

  describe("sendTransaction (Lane A)", () => {
    test("preflights, queues to the bridge, waits the receipt, returns it", async () => {
      bridgeSend.mockResolvedValue("0xhash");
      waitForReceipt.mockResolvedValue({
        status: "success",
        transactionHash: "0xhash",
        blockNumber: 1n,
        gasUsed: 2n,
      });
      const session = await makeSession();

      const receipt = await session.sendTransaction({
        to: "0xTo000000000000000000000000000000000000001",
        data: "0xabcd",
        value: 100n,
        label: "Test",
      });

      expect(publicCall).toHaveBeenCalledOnce();
      expect(bridgeSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "0xTo000000000000000000000000000000000000001",
          data: "0xabcd",
          value: 100n,
        }),
      );
      expect(receipt.transactionHash).toBe("0xhash");
    });

    test("aborts + throws when the preflight predicts a revert", async () => {
      publicCall.mockRejectedValue({shortMessage: "execution reverted"});
      const session = await makeSession();
      await expect(session.sendTransaction({to: "0xTo", data: "0x", label: "x"} as any)).rejects.toThrow(
        /would revert \(preflight\): execution reverted/,
      );
      expect(bridgeClose).toHaveBeenCalled();
      expect(bridgeSend).not.toHaveBeenCalled();
    });

    test("throws on an on-chain revert receipt", async () => {
      bridgeSend.mockResolvedValue("0xhash");
      waitForReceipt.mockResolvedValue({status: "reverted", transactionHash: "0xhash"});
      const session = await makeSession();
      await expect(session.sendTransaction({to: "0xTo", data: "0x", label: "x"} as any)).rejects.toThrow(
        /reverted/,
      );
    });
  });

  describe("eip1193Provider (Lane B shim)", () => {
    test("eth_chainId is answered locally as the configured chain id hex", async () => {
      const session = await makeSession();
      await expect(session.eip1193Provider.request({method: "eth_chainId"})).resolves.toBe("0x107d");
    });

    test("eth_accounts / eth_requestAccounts return the connected signer", async () => {
      const session = await makeSession();
      await expect(session.eip1193Provider.request({method: "eth_accounts"})).resolves.toEqual([
        session.signerAddress,
      ]);
      await expect(session.eip1193Provider.request({method: "eth_requestAccounts"})).resolves.toEqual([
        session.signerAddress,
      ]);
    });

    test("eth_sendTransaction forwards hex fields to the bridge and resolves the hash", async () => {
      bridgeSend.mockResolvedValue("0xhash");
      const session = await makeSession();
      const hash = await session.eip1193Provider.request({
        method: "eth_sendTransaction",
        params: [
          {
            from: session.signerAddress,
            to: "0xConsensus000000000000000000000000000000001",
            data: "0xdeadbeef",
            value: "0x64",
            gas: "0x5208",
            gasPrice: "0x1",
            nonce: "0x2",
            type: "0x0",
          },
        ],
      });
      expect(hash).toBe("0xhash");
      expect(bridgeSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "0xConsensus000000000000000000000000000000001",
          data: "0xdeadbeef",
          value: 100n,
          gas: 21000n,
          gasPrice: 1n,
          nonce: 2,
          type: "0x0",
        }),
      );
      // Does NOT wait for the receipt (the SDK does that).
      expect(waitForReceipt).not.toHaveBeenCalled();
    });

    test("setNextLabel is consumed for exactly the next send, then reset to default", async () => {
      bridgeSend.mockResolvedValue("0xhash");
      const session = await makeSession();
      session.setNextLabel("Deploy Counter.py");
      await session.eip1193Provider.request({
        method: "eth_sendTransaction",
        params: [{to: "0xA", data: "0x"}],
      });
      expect(bridgeSend).toHaveBeenLastCalledWith(expect.objectContaining({label: "Deploy Counter.py"}));

      await session.eip1193Provider.request({
        method: "eth_sendTransaction",
        params: [{to: "0xB", data: "0x"}],
      });
      expect(bridgeSend).toHaveBeenLastCalledWith(expect.objectContaining({label: "GenLayer transaction"}));
    });

    test("unsupported methods throw a clear error", async () => {
      const session = await makeSession();
      for (const method of ["personal_sign", "eth_signTypedData_v4", "eth_signTransaction"]) {
        await expect(session.eip1193Provider.request({method})).rejects.toThrow(
          new RegExp(`Method ${method} is not supported`),
        );
      }
    });
  });
});
