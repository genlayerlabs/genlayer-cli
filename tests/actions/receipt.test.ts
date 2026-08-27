import {describe, test, vi, beforeEach, afterEach, expect} from "vitest";
import {createClient, createAccount} from "genlayer-js";
import type {TransactionHash} from "genlayer-js/types";
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
    const mockReceipt = {lifecycle: {state: "finalized"}, data: {hash: mockTxId}};

    vi.mocked(mockClient.waitForTransactionReceipt).mockResolvedValue(mockReceipt);

    await receiptAction.receipt({
      txId: mockTxId,
      retries: defaultRetries,
      interval: defaultInterval,
    });

    expect(mockClient.waitForTransactionReceipt).toHaveBeenCalledWith({
      hash: mockTxId,
      waitUntil: "finalized",
      retries: defaultRetries,
      interval: defaultInterval,
    });
    expect(receiptAction["succeedSpinner"]).toHaveBeenCalledWith("Finalized · Complete", {
      status: "Finalized · Complete",
      data: {hash: mockTxId},
    });
  });

  test("retrieves transaction receipt with custom options", async () => {
    const mockReceipt = {lifecycle: {state: "decided", outcome: "accepted"}, data: {hash: mockTxId}};

    vi.mocked(mockClient.waitForTransactionReceipt).mockResolvedValue(mockReceipt);

    await receiptAction.receipt({
      txId: mockTxId,
      waitUntil: "decided",
      retries: 50,
      interval: 3000,
    });

    expect(mockClient.waitForTransactionReceipt).toHaveBeenCalledWith({
      hash: mockTxId,
      waitUntil: "decided",
      retries: 50,
      interval: 3000,
    });
    expect(receiptAction["succeedSpinner"]).toHaveBeenCalledWith("Decided · Accepted", {
      status: "Decided · Accepted",
      data: {hash: mockTxId},
    });
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
    const mockReceipt = {lifecycle: {state: "finalized"}, data: {hash: mockTxId}};

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
      waitUntil: "finalized",
      retries: defaultRetries,
      interval: defaultInterval,
    });
    expect(receiptAction["succeedSpinner"]).toHaveBeenCalledWith("Finalized · Complete", {
      status: "Finalized · Complete",
      data: {hash: mockTxId},
    });
  });

  test("returns the full raw receipt behind --raw", async () => {
    const mockReceipt = {
      status: 5,
      statusName: "ACCEPTED",
      lifecycle: {state: "decided", outcome: "accepted"},
    };
    vi.mocked(mockClient.waitForTransactionReceipt).mockResolvedValue(mockReceipt as any);

    await receiptAction.receipt({
      txId: mockTxId,
      retries: defaultRetries,
      interval: defaultInterval,
      raw: true,
    });

    expect(receiptAction["succeedSpinner"]).toHaveBeenCalledWith("Raw transaction receipt", mockReceipt);
  });

  test("validates the receipt wait target", async () => {
    await receiptAction.receipt({
      txId: mockTxId,
      waitUntil: "projected",
      retries: defaultRetries,
      interval: defaultInterval,
    });

    expect(receiptAction["failSpinner"]).toHaveBeenCalledWith(
      "Invalid receipt wait target",
      expect.stringContaining("Invalid wait target: projected"),
    );

    expect(mockClient.waitForTransactionReceipt).not.toHaveBeenCalled();
  });

  test("accepts materialized decision and finalization targets", async () => {
    const mockReceipt = {lifecycle: {state: "processing", phase: "pending"}, data: {hash: mockTxId}};
    vi.mocked(mockClient.waitForTransactionReceipt).mockResolvedValue(mockReceipt);

    const targets = [
      {input: "decided", expected: "decided"},
      {input: "FINALIZED", expected: "finalized"},
    ];

    for (const {input, expected} of targets) {
      await receiptAction.receipt({
        txId: mockTxId,
        waitUntil: input,
        retries: defaultRetries,
        interval: defaultInterval,
      });

      expect(mockClient.waitForTransactionReceipt).toHaveBeenCalledWith({
        hash: mockTxId,
        waitUntil: expected,
        retries: defaultRetries,
        interval: defaultInterval,
      });
    }
  });

  test("prints only stdout when --stdout is provided", async () => {
    const mockReceipt = {
      consensus_data: {
        leader_receipt: [
          {
            genvm_result: {
              stdout: "program stdout",
              stderr: "program stderr",
            },
          },
        ],
      },
    };

    vi.mocked(mockClient.waitForTransactionReceipt).mockResolvedValue(mockReceipt as any);

    await receiptAction.receipt({
      txId: mockTxId,
      retries: defaultRetries,
      interval: defaultInterval,
      stdout: true,
    } as ReceiptParams);

    expect(receiptAction["succeedSpinner"]).toHaveBeenCalledWith(
      "Transaction stdout retrieved successfully",
      "program stdout",
    );
  });

  test("prints only stderr when --stderr is provided", async () => {
    const mockReceipt = {
      consensus_data: {
        leader_receipt: [
          {
            genvm_result: {
              stdout: "program stdout",
              stderr: "program stderr",
            },
          },
        ],
      },
    };

    vi.mocked(mockClient.waitForTransactionReceipt).mockResolvedValue(mockReceipt as any);

    await receiptAction.receipt({
      txId: mockTxId,
      retries: defaultRetries,
      interval: defaultInterval,
      stderr: true,
    } as ReceiptParams);

    expect(receiptAction["succeedSpinner"]).toHaveBeenCalledWith(
      "Transaction stderr retrieved successfully",
      "program stderr",
    );
  });

  test("prints both stdout and stderr when both flags are provided", async () => {
    const mockReceipt = {
      consensus_data: {
        leader_receipt: [
          {
            genvm_result: {
              stdout: "program stdout",
              stderr: "program stderr",
            },
          },
        ],
      },
    };

    vi.mocked(mockClient.waitForTransactionReceipt).mockResolvedValue(mockReceipt as any);

    await receiptAction.receipt({
      txId: mockTxId,
      retries: defaultRetries,
      interval: defaultInterval,
      stdout: true,
      stderr: true,
    } as ReceiptParams);

    expect(receiptAction["succeedSpinner"]).toHaveBeenCalledWith("Transaction stdout and stderr", {
      stdout: "program stdout",
      stderr: "program stderr",
    });
  });
});
