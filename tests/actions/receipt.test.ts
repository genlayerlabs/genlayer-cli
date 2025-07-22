import {describe, test, vi, beforeEach, afterEach, expect} from "vitest";
import {createClient, createAccount} from "genlayer-js";
import type {TransactionHash} from "genlayer-js/types";
import {TransactionStatus} from "genlayer-js/types";
import {ReceiptAction, type ReceiptParams} from "../../src/commands/transactions/receipt";

vi.mock("genlayer-js");

describe("ReceiptAction", () => {
  let receiptAction: ReceiptAction;
  const mockClient = {
    waitForTransactionReceipt: vi.fn(),
    initializeConsensusSmartContract: vi.fn(),
  };

  const mockPrivateKey = "mocked_private_key";
  const mockTxId = "0x1234567890123456789012345678901234567890123456789012345678901234" as TransactionHash;
  const defaultRetries = 100;
  const defaultInterval = 5000;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue(mockClient as any);
    vi.mocked(createAccount).mockReturnValue({privateKey: mockPrivateKey} as any);
    receiptAction = new ReceiptAction();
    vi.spyOn(receiptAction as any, "getAccount").mockResolvedValue({privateKey: mockPrivateKey});

    vi.spyOn(receiptAction as any, "startSpinner").mockImplementation(() => {});
    vi.spyOn(receiptAction as any, "succeedSpinner").mockImplementation(() => {});
    vi.spyOn(receiptAction as any, "failSpinner").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("retrieves transaction receipt successfully with default options", async () => {
    const mockReceipt = {status: "FINALIZED", data: {hash: mockTxId}};

    vi.mocked(mockClient.waitForTransactionReceipt).mockResolvedValue(mockReceipt);

    await receiptAction.receipt({
      txId: mockTxId,
      retries: defaultRetries,
      interval: defaultInterval,
    });

    expect(mockClient.waitForTransactionReceipt).toHaveBeenCalledWith({
      hash: mockTxId,
      status: TransactionStatus.FINALIZED,
      retries: defaultRetries,
      interval: defaultInterval,
    });
    expect(receiptAction["succeedSpinner"]).toHaveBeenCalledWith(
      "Transaction receipt retrieved successfully",
      mockReceipt,
    );
  });

  test("retrieves transaction receipt with custom options", async () => {
    const mockReceipt = {status: "ACCEPTED", data: {hash: mockTxId}};

    vi.mocked(mockClient.waitForTransactionReceipt).mockResolvedValue(mockReceipt);

    await receiptAction.receipt({
      txId: mockTxId,
      status: "ACCEPTED",
      retries: 50,
      interval: 3000,
    });

    expect(mockClient.waitForTransactionReceipt).toHaveBeenCalledWith({
      hash: mockTxId,
      status: TransactionStatus.ACCEPTED,
      retries: 50,
      interval: 3000,
    });
    expect(receiptAction["succeedSpinner"]).toHaveBeenCalledWith(
      "Transaction receipt retrieved successfully",
      mockReceipt,
    );
  });

  test("handles waitForTransactionReceipt errors", async () => {
    vi.mocked(mockClient.waitForTransactionReceipt).mockRejectedValue(new Error("Mocked receipt error"));

    await receiptAction.receipt({
      txId: mockTxId,
      retries: defaultRetries,
      interval: defaultInterval,
    });

    expect(receiptAction["failSpinner"]).toHaveBeenCalledWith(
      "Error retrieving transaction receipt",
      expect.any(Error),
    );
  });

  test("uses custom RPC URL for receipt operations", async () => {
    const rpcUrl = "https://custom-rpc-url.com";
    const mockReceipt = {status: "FINALIZED", data: {hash: mockTxId}};

    vi.mocked(mockClient.waitForTransactionReceipt).mockResolvedValue(mockReceipt);

    await receiptAction.receipt({
      txId: mockTxId,
      retries: defaultRetries,
      interval: defaultInterval,
      rpc: rpcUrl,
    });

    expect(createClient).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: rpcUrl,
      }),
    );
    expect(mockClient.waitForTransactionReceipt).toHaveBeenCalledWith({
      hash: mockTxId,
      status: TransactionStatus.FINALIZED,
      retries: defaultRetries,
      interval: defaultInterval,
    });
    expect(receiptAction["succeedSpinner"]).toHaveBeenCalledWith(
      "Transaction receipt retrieved successfully",
      mockReceipt,
    );
  });

  test("validates transaction status and shows error for invalid status", async () => {
    await receiptAction.receipt({
      txId: mockTxId,
      status: "INVALID_STATUS",
      retries: defaultRetries,
      interval: defaultInterval,
    });

    expect(receiptAction["failSpinner"]).toHaveBeenCalledWith(
      "Invalid transaction status",
      expect.stringContaining("Invalid status: INVALID_STATUS")
    );
    
    expect(mockClient.waitForTransactionReceipt).not.toHaveBeenCalled();
  });

  test("accepts valid transaction statuses", async () => {
    const mockReceipt = {status: "PENDING", data: {hash: mockTxId}};
    vi.mocked(mockClient.waitForTransactionReceipt).mockResolvedValue(mockReceipt);

    const testStatuses = [
      {input: "accepted", expected: TransactionStatus.ACCEPTED},
      {input: "FINALIZED", expected: TransactionStatus.FINALIZED},
      {input: "pending", expected: TransactionStatus.PENDING},
      {input: "COMMITTING", expected: TransactionStatus.COMMITTING},
    ];

    for (const {input, expected} of testStatuses) {
      await receiptAction.receipt({
        txId: mockTxId,
        status: input,
        retries: defaultRetries,
        interval: defaultInterval,
      });

      expect(mockClient.waitForTransactionReceipt).toHaveBeenCalledWith({
        hash: mockTxId,
        status: expected,
        retries: defaultRetries,
        interval: defaultInterval,
      });
    }
  });

}); 