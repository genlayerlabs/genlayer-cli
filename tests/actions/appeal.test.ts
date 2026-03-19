import {describe, test, vi, beforeEach, afterEach, expect} from "vitest";
import {createClient, createAccount} from "genlayer-js";
import type {TransactionHash} from "genlayer-js/types";
import {AppealAction} from "../../src/commands/transactions/appeal";

vi.mock("genlayer-js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("genlayer-js")>();
  return {
    ...actual,
    createClient: vi.fn(),
    createAccount: vi.fn(),
  };
});

describe("AppealAction", () => {
  let appealAction: AppealAction;
  const mockClient = {
    appealTransaction: vi.fn(),
    waitForTransactionReceipt: vi.fn(),
    initializeConsensusSmartContract: vi.fn(),
    getMinAppealBond: vi.fn(),
  };

  const mockPrivateKey = "mocked_private_key";
  const mockTxId = "0x1234567890123456789012345678901234567890123456789012345678901234" as TransactionHash;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue(mockClient as any);
    vi.mocked(createAccount).mockReturnValue({privateKey: mockPrivateKey} as any);
    appealAction = new AppealAction();
    vi.spyOn(appealAction as any, "getAccount").mockResolvedValue({privateKey: mockPrivateKey});

    vi.spyOn(appealAction as any, "startSpinner").mockImplementation(() => {});
    vi.spyOn(appealAction as any, "succeedSpinner").mockImplementation(() => {});
    vi.spyOn(appealAction as any, "failSpinner").mockImplementation(() => {});
    vi.spyOn(appealAction as any, "stopSpinner").mockImplementation(() => {});
    vi.spyOn(appealAction as any, "setSpinnerText").mockImplementation(() => {});
    vi.spyOn(appealAction as any, "logInfo").mockImplementation(() => {});
    vi.spyOn(appealAction as any, "confirmPrompt").mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("auto-calculates bond and appeals successfully", async () => {
    const mockReceipt = {status: "success"};
    vi.mocked(mockClient.getMinAppealBond).mockResolvedValue(500000000000000000000n);
    vi.mocked(mockClient.appealTransaction).mockResolvedValue("0xhash");
    vi.mocked(mockClient.waitForTransactionReceipt).mockResolvedValue(mockReceipt);

    await appealAction.appeal({txId: mockTxId});

    expect(mockClient.getMinAppealBond).toHaveBeenCalledWith({txId: mockTxId});
    expect(mockClient.appealTransaction).toHaveBeenCalledWith({
      txId: mockTxId,
      value: 500000000000000000000n,
    });
    expect(appealAction["succeedSpinner"]).toHaveBeenCalledWith(
      "Appeal successfully executed",
      mockReceipt,
    );
  });

  test("uses explicit bond when provided", async () => {
    const mockReceipt = {status: "success"};
    vi.mocked(mockClient.appealTransaction).mockResolvedValue("0xhash");
    vi.mocked(mockClient.waitForTransactionReceipt).mockResolvedValue(mockReceipt);

    await appealAction.appeal({txId: mockTxId, bond: "100gen"});

    expect(mockClient.getMinAppealBond).not.toHaveBeenCalled();
    expect(mockClient.appealTransaction).toHaveBeenCalledWith({
      txId: mockTxId,
      value: 100000000000000000000n,
    });
  });

  test("falls back to undefined value when bond calculation fails", async () => {
    const mockReceipt = {status: "success"};
    vi.mocked(mockClient.getMinAppealBond).mockRejectedValue(new Error("not supported"));
    vi.mocked(mockClient.appealTransaction).mockResolvedValue("0xhash");
    vi.mocked(mockClient.waitForTransactionReceipt).mockResolvedValue(mockReceipt);

    await appealAction.appeal({txId: mockTxId});

    expect(mockClient.appealTransaction).toHaveBeenCalledWith({
      txId: mockTxId,
      value: undefined,
    });
  });

  test("handles appealTransaction errors", async () => {
    vi.mocked(mockClient.getMinAppealBond).mockResolvedValue(0n);
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
    vi.mocked(mockClient.getMinAppealBond).mockResolvedValue(0n);
    vi.mocked(mockClient.appealTransaction).mockResolvedValue("0xhash");
    vi.mocked(mockClient.waitForTransactionReceipt).mockResolvedValue(mockReceipt);

    await appealAction.appeal({txId: mockTxId, rpc: rpcUrl});

    expect(createClient).toHaveBeenCalledWith(
      expect.objectContaining({endpoint: rpcUrl}),
    );
  });

  test("appealBond returns minimum bond", async () => {
    vi.mocked(mockClient.getMinAppealBond).mockResolvedValue(500000000000000000000n);

    await appealAction.appealBond({txId: mockTxId});

    expect(mockClient.getMinAppealBond).toHaveBeenCalledWith({txId: mockTxId});
    expect(appealAction["succeedSpinner"]).toHaveBeenCalledWith(
      `Minimum appeal bond: 500 GEN`,
    );
  });

  test("appealBond handles errors", async () => {
    vi.mocked(mockClient.getMinAppealBond).mockRejectedValue(new Error("not supported"));

    await appealAction.appealBond({txId: mockTxId});

    expect(appealAction["failSpinner"]).toHaveBeenCalledWith(
      "Error calculating appeal bond",
      expect.any(Error),
    );
  });
});
