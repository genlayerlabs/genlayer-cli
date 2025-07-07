import {describe, test, vi, beforeEach, afterEach, expect} from "vitest";
import {createClient, createAccount} from "genlayer-js";
import type {TransactionHash} from "genlayer-js/types";
import {AppealAction} from "../../src/commands/transactions/appeal";

vi.mock("genlayer-js");

describe("AppealAction", () => {
  let appealAction: AppealAction;
  const mockClient = {
    appealTransaction: vi.fn(),
    waitForTransactionReceipt: vi.fn(),
    initializeConsensusSmartContract: vi.fn(),
  };

  const mockPrivateKey = "mocked_private_key";
  const mockTxId = "0x1234567890123456789012345678901234567890123456789012345678901234" as TransactionHash;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue(mockClient as any);
    vi.mocked(createAccount).mockReturnValue({privateKey: mockPrivateKey} as any);
    appealAction = new AppealAction();
    vi.spyOn(appealAction as any, "getPrivateKey").mockResolvedValue(mockPrivateKey);

    vi.spyOn(appealAction as any, "startSpinner").mockImplementation(() => {});
    vi.spyOn(appealAction as any, "succeedSpinner").mockImplementation(() => {});
    vi.spyOn(appealAction as any, "failSpinner").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("calls appealTransaction successfully", async () => {
    const mockReceipt = {status: "success"};

    vi.mocked(mockClient.waitForTransactionReceipt).mockResolvedValue(mockReceipt);

    await appealAction.appeal({
      txId: mockTxId,
    });

    expect(mockClient.appealTransaction).toHaveBeenCalledWith({
      txId: mockTxId,
    });
    expect(appealAction["succeedSpinner"]).toHaveBeenCalledWith(
      "Appeal operation successfully executed",
      mockReceipt,
    );
  });

  test("handles appealTransaction errors", async () => {
    vi.mocked(mockClient.appealTransaction).mockRejectedValue(new Error("Mocked appeal error"));

    await appealAction.appeal({txId: mockTxId});

    expect(appealAction["failSpinner"]).toHaveBeenCalledWith(
      "Error during appeal operation",
      expect.any(Error),
    );
  });

  test("uses custom RPC URL for appeal operations", async () => {
    const rpcUrl = "https://custom-rpc-url.com";
    const mockReceipt = {status: "success"};

    vi.mocked(mockClient.waitForTransactionReceipt).mockResolvedValue(mockReceipt);

    await appealAction.appeal({
      txId: mockTxId,
      rpc: rpcUrl,
    });

    expect(createClient).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: rpcUrl,
      }),
    );
    expect(mockClient.appealTransaction).toHaveBeenCalledWith({
      txId: mockTxId,
    });
    expect(appealAction["succeedSpinner"]).toHaveBeenCalledWith(
      "Appeal operation successfully executed",
      mockReceipt,
    );
  });

  test("initializes consensus smart contract before appeal", async () => {
    const mockReceipt = {status: "success"};

    vi.mocked(mockClient.waitForTransactionReceipt).mockResolvedValue(mockReceipt);

    await appealAction.appeal({txId: mockTxId});

    expect(mockClient.initializeConsensusSmartContract).toHaveBeenCalledTimes(1);
    expect(mockClient.appealTransaction).toHaveBeenCalled();
  });
}); 