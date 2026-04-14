import {describe, test, vi, beforeEach, afterEach, expect} from "vitest";
import {createClient, createAccount} from "genlayer-js";
import type {TransactionHash} from "genlayer-js/types";
import {FinalizeAction} from "../../src/commands/transactions/finalize";

vi.mock("genlayer-js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("genlayer-js")>();
  return {
    ...actual,
    createClient: vi.fn(),
    createAccount: vi.fn(),
  };
});

describe("FinalizeAction", () => {
  let finalizeAction: FinalizeAction;
  const mockClient = {
    finalizeTransaction: vi.fn(),
    finalizeIdlenessTxs: vi.fn(),
  };

  const mockPrivateKey = "mocked_private_key";
  const mockTxId = "0x1234567890123456789012345678901234567890123456789012345678901234" as TransactionHash;
  const mockTxId2 = "0xabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcd" as TransactionHash;
  const mockEvmHash = "0xdeadbeef" as `0x${string}`;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue(mockClient as any);
    vi.mocked(createAccount).mockReturnValue({privateKey: mockPrivateKey} as any);
    finalizeAction = new FinalizeAction();
    vi.spyOn(finalizeAction as any, "getAccount").mockResolvedValue({privateKey: mockPrivateKey});

    vi.spyOn(finalizeAction as any, "startSpinner").mockImplementation(() => {});
    vi.spyOn(finalizeAction as any, "succeedSpinner").mockImplementation(() => {});
    vi.spyOn(finalizeAction as any, "failSpinner").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("finalize calls client.finalizeTransaction and reports the EVM hash", async () => {
    vi.mocked(mockClient.finalizeTransaction).mockResolvedValue(mockEvmHash);

    await finalizeAction.finalize({txId: mockTxId});

    expect(mockClient.finalizeTransaction).toHaveBeenCalledWith({txId: mockTxId});
    expect(finalizeAction["succeedSpinner"]).toHaveBeenCalledWith(
      "Transaction finalized",
      {txId: mockTxId, evmTransactionHash: mockEvmHash},
    );
  });

  test("finalize surfaces underlying errors via failSpinner", async () => {
    vi.mocked(mockClient.finalizeTransaction).mockRejectedValue(new Error("boom"));

    await finalizeAction.finalize({txId: mockTxId});

    expect(finalizeAction["failSpinner"]).toHaveBeenCalledWith(
      "Error finalizing transaction",
      expect.any(Error),
    );
  });

  test("finalize uses custom RPC URL when provided", async () => {
    vi.mocked(mockClient.finalizeTransaction).mockResolvedValue(mockEvmHash);

    await finalizeAction.finalize({txId: mockTxId, rpc: "https://custom.com"});

    expect(createClient).toHaveBeenCalledWith(
      expect.objectContaining({endpoint: "https://custom.com"}),
    );
  });

  test("finalizeBatch calls client.finalizeIdlenessTxs with all ids", async () => {
    vi.mocked(mockClient.finalizeIdlenessTxs).mockResolvedValue(mockEvmHash);

    await finalizeAction.finalizeBatch({txIds: [mockTxId, mockTxId2]});

    expect(mockClient.finalizeIdlenessTxs).toHaveBeenCalledWith({
      txIds: [mockTxId, mockTxId2],
    });
    expect(finalizeAction["succeedSpinner"]).toHaveBeenCalledWith(
      "Idle transactions finalized",
      {count: 2, txIds: [mockTxId, mockTxId2], evmTransactionHash: mockEvmHash},
    );
  });

  test("finalizeBatch rejects an empty list without calling the client", async () => {
    await finalizeAction.finalizeBatch({txIds: []});

    expect(mockClient.finalizeIdlenessTxs).not.toHaveBeenCalled();
    expect(finalizeAction["failSpinner"]).toHaveBeenCalledWith(
      "At least one txId is required.",
    );
  });

  test("finalizeBatch surfaces underlying errors via failSpinner", async () => {
    vi.mocked(mockClient.finalizeIdlenessTxs).mockRejectedValue(new Error("revert"));

    await finalizeAction.finalizeBatch({txIds: [mockTxId]});

    expect(finalizeAction["failSpinner"]).toHaveBeenCalledWith(
      "Error finalizing idle transactions",
      expect.any(Error),
    );
  });
});
