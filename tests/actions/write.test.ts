import {describe, test, vi, beforeEach, afterEach, expect} from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  createClient,
  createAccount,
  isSuccessful,
  formatStakingAmount,
  deriveExternalMessageCallKey,
} from "genlayer-js";
import {WriteAction} from "../../src/commands/contracts/write";

vi.mock("genlayer-js");

describe("WriteAction", () => {
  let writeAction: WriteAction;
  const mockClient = {
    writeContract: vi.fn(),
    waitForTransactionReceipt: vi.fn(),
    initializeConsensusSmartContract: vi.fn(),
    estimateTransactionFees: vi.fn(),
  };

  const mockPrivateKey = "mocked_private_key";

  const writeFeeProfile = (profile: Record<string, any>): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "genlayer-cli-fees-"));
    const profilePath = path.join(dir, "fee-profile.json");
    fs.writeFileSync(profilePath, JSON.stringify(profile));
    return profilePath;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue(mockClient as any);
    vi.mocked(createAccount).mockReturnValue({privateKey: mockPrivateKey} as any);
    vi.mocked(formatStakingAmount).mockImplementation((value: bigint) => `${value.toString()} GEN`);
    vi.mocked(deriveExternalMessageCallKey).mockImplementation(
      (selectorOrCalldata: `0x${string}` | Uint8Array = "0x") => {
        const hex =
          typeof selectorOrCalldata === "string"
            ? selectorOrCalldata.slice(2)
            : Buffer.from(selectorOrCalldata).toString("hex");
        if (hex.length < 8) return "0x0000000000000000000000000000000000000000000000000000000000000000";
        return `0x${hex.slice(0, 8).padEnd(64, "0")}`;
      },
    );
    vi.mocked(isSuccessful).mockImplementation((receipt: any) => {
      const statusName = receipt.statusName ?? receipt.status;
      const executionResultName =
        receipt.txExecutionResultName ??
        (receipt.txExecutionResult === 1 ? "FINISHED_WITH_RETURN" : undefined);
      return (
        (statusName === "ACCEPTED" || statusName === "FINALIZED") &&
        executionResultName === "FINISHED_WITH_RETURN"
      );
    });
    writeAction = new WriteAction();
    vi.spyOn(writeAction as any, "getAccount").mockResolvedValue({privateKey: mockPrivateKey});

    vi.spyOn(writeAction as any, "startSpinner").mockImplementation(() => {});
    vi.spyOn(writeAction as any, "succeedSpinner").mockImplementation(() => {});
    vi.spyOn(writeAction as any, "failSpinner").mockImplementation(() => {});
    vi.spyOn(writeAction as any, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("calls writeContract successfully", async () => {
    const options = {args: [42, "Update"]};
    const mockHash = "0xMockedTransactionHash";
    const mockReceipt = {statusName: "ACCEPTED", txExecutionResultName: "FINISHED_WITH_RETURN"};

    vi.mocked(mockClient.writeContract).mockResolvedValue(mockHash);
    vi.mocked(mockClient.waitForTransactionReceipt).mockResolvedValue(mockReceipt);

    await writeAction.write({
      contractAddress: "0xMockedContract",
      method: "updateData",
      ...options,
    });

    expect(mockClient.writeContract).toHaveBeenCalledWith({
      address: "0xMockedContract",
      functionName: "updateData",
      args: [42, "Update"],
      value: 0n,
    });
    expect(writeAction["log"]).toHaveBeenCalledWith("Write Transaction Hash:", mockHash);
    expect(mockClient.waitForTransactionReceipt).toHaveBeenCalledWith({
      hash: mockHash,
      retries: 100,
      interval: 5000,
      waitUntil: "decided",
      fullTransaction: true,
    });
    expect(writeAction["succeedSpinner"]).toHaveBeenCalledWith("Write operation successfully executed", {
      ...mockReceipt,
      consensusStatus: "ACCEPTED",
    });
  });

  test("calls writeContract with fee options", async () => {
    const mockHash = "0xMockedTransactionHash";
    const mockReceipt = {statusName: "ACCEPTED", txExecutionResultName: "FINISHED_WITH_RETURN"};

    vi.mocked(mockClient.writeContract).mockResolvedValue(mockHash);
    vi.mocked(mockClient.waitForTransactionReceipt).mockResolvedValue(mockReceipt);

    await writeAction.write({
      contractAddress: "0xMockedContract",
      method: "updateData",
      args: [42],
      fees: JSON.stringify({
        distribution: {
          totalMessageFees: "3",
        },
        messageAllocations: [
          {
            messageType: "external",
            recipient: "0x0000000000000000000000000000000000000001",
            callKeySelector: "0xaabbccdd",
            budget: "3",
          },
        ],
      }),
      feeValue: "4",
      validUntil: "999",
    });

    expect(mockClient.writeContract).toHaveBeenCalledWith({
      address: "0xMockedContract",
      functionName: "updateData",
      args: [42],
      value: 0n,
      fees: {
        distribution: {
          totalMessageFees: "3",
        },
        messageAllocations: [
          {
            messageType: 0,
            recipient: "0x0000000000000000000000000000000000000001",
            callKey: `0xaabbccdd${"0".repeat(56)}`,
            budget: "3",
          },
        ],
        feeValue: "4",
      },
      validUntil: "999",
    });
  });

  test("calls writeContract with fees estimated from a method fee profile", async () => {
    const profilePath = writeFeeProfile({
      version: 1,
      network: "localnet",
      methods: {
        updateData: {
          leaderTimeunitsAllocation: "10",
          validatorTimeunitsAllocation: "20",
          executionBudgetPerRound: "30",
          totalMessageFees: "5",
          rotationsPerRound: "1",
        },
      },
    });
    const feeEstimate = {
      distribution: {
        leaderTimeunitsAllocation: "10",
        validatorTimeunitsAllocation: "20",
        executionBudgetPerRound: "30",
        totalMessageFees: "5",
        appealRounds: "2",
        rotations: ["1", "1", "1"],
      },
      feeValue: "123",
    };
    const mockHash = "0xMockedTransactionHash";
    const mockReceipt = {statusName: "ACCEPTED", txExecutionResultName: "FINISHED_WITH_RETURN"};

    vi.mocked(mockClient.estimateTransactionFees).mockResolvedValue(feeEstimate);
    vi.mocked(mockClient.writeContract).mockResolvedValue(mockHash);
    vi.mocked(mockClient.waitForTransactionReceipt).mockResolvedValue(mockReceipt);

    await writeAction.write({
      contractAddress: "0xMockedContract",
      method: "updateData",
      args: [42],
      feeProfile: profilePath,
      feePreset: "high",
    });

    expect(mockClient.estimateTransactionFees).toHaveBeenCalledWith({
      leaderTimeunitsAllocation: "10",
      validatorTimeunitsAllocation: "20",
      executionBudgetPerRound: "30",
      totalMessageFees: "5",
      appealRounds: "2",
      rotations: ["1", "1", "1"],
    });
    expect(mockClient.writeContract).toHaveBeenCalledWith({
      address: "0xMockedContract",
      functionName: "updateData",
      args: [42],
      value: 0n,
      fees: {
        distribution: feeEstimate.distribution,
        feeValue: "123",
      },
    });
  });

  test("handles writeContract errors", async () => {
    vi.mocked(mockClient.writeContract).mockRejectedValue(new Error("Mocked write error"));

    await writeAction.write({contractAddress: "0xMockedContract", method: "updateData", args: [1]});

    expect(writeAction["failSpinner"]).toHaveBeenCalledWith(
      "Error during write operation",
      expect.any(Error),
    );
  });

  test("fails when write reaches consensus but execution fails", async () => {
    const mockHash = "0xMockedTransactionHash";

    vi.mocked(mockClient.writeContract).mockResolvedValue(mockHash);
    vi.mocked(mockClient.waitForTransactionReceipt).mockResolvedValue({
      statusName: "ACCEPTED",
      txExecutionResultName: "FINISHED_WITH_ERROR",
    });

    await writeAction.write({contractAddress: "0xMockedContract", method: "updateData", args: [1]});

    expect(writeAction["failSpinner"]).toHaveBeenCalledWith(
      "Error during write operation",
      expect.objectContaining({
        message: expect.stringContaining("leader execution result: FINISHED_WITH_ERROR"),
      }),
    );
  });

  test("fails when write is undetermined despite leader return", async () => {
    const mockHash = "0xMockedTransactionHash";

    vi.mocked(mockClient.writeContract).mockResolvedValue(mockHash);
    vi.mocked(mockClient.waitForTransactionReceipt).mockResolvedValue({
      statusName: "UNDETERMINED",
      txExecutionResultName: "FINISHED_WITH_RETURN",
    });

    await writeAction.write({contractAddress: "0xMockedContract", method: "updateData", args: [1]});

    expect(writeAction["failSpinner"]).toHaveBeenCalledWith(
      "Error during write operation",
      expect.objectContaining({
        message: expect.stringContaining("UNDETERMINED"),
      }),
    );
  });

  test("diagnoses leader execution timeout", async () => {
    const mockHash = "0xMockedTransactionHash";

    vi.mocked(mockClient.writeContract).mockResolvedValue(mockHash);
    vi.mocked(mockClient.waitForTransactionReceipt).mockResolvedValue({
      statusName: "ACCEPTED",
      txExecutionResult: 3,
    });

    await writeAction.write({contractAddress: "0xMockedContract", method: "updateData", args: [1]});

    expect(writeAction["failSpinner"]).toHaveBeenCalledWith(
      "Error during write operation",
      expect.objectContaining({
        message: expect.stringContaining("leader timed out during execution"),
      }),
    );
  });

  test("diagnoses non-deterministic disagreement", async () => {
    const mockHash = "0xMockedTransactionHash";

    vi.mocked(mockClient.writeContract).mockResolvedValue(mockHash);
    vi.mocked(mockClient.waitForTransactionReceipt).mockResolvedValue({
      statusName: "ACCEPTED",
      txExecutionResult: 4,
    });

    await writeAction.write({contractAddress: "0xMockedContract", method: "updateData", args: [1]});

    expect(writeAction["failSpinner"]).toHaveBeenCalledWith(
      "Error during write operation",
      expect.objectContaining({
        message: expect.stringContaining("validators disagreed on non-deterministic output"),
      }),
    );
  });

  test("fails when write is canceled", async () => {
    const mockHash = "0xMockedTransactionHash";

    vi.mocked(mockClient.writeContract).mockResolvedValue(mockHash);
    vi.mocked(mockClient.waitForTransactionReceipt).mockResolvedValue({
      statusName: "CANCELED",
      txExecutionResultName: "NOT_VOTED",
    });

    await writeAction.write({contractAddress: "0xMockedContract", method: "updateData", args: [1]});

    expect(writeAction["failSpinner"]).toHaveBeenCalledWith(
      "Error during write operation",
      expect.objectContaining({
        message: expect.stringContaining("CANCELED before execution"),
      }),
    );
  });

  test("accepts studio-shaped successful receipt", async () => {
    const mockHash = "0xMockedTransactionHash";

    vi.mocked(mockClient.writeContract).mockResolvedValue(mockHash);
    vi.mocked(mockClient.waitForTransactionReceipt).mockResolvedValue({
      statusName: "ACCEPTED",
      data: {
        consensus_data: {
          leader_receipt: [{execution_result: "SUCCESS"}],
        },
      },
    });

    await writeAction.write({contractAddress: "0xMockedContract", method: "updateData", args: [1]});

    expect(writeAction["succeedSpinner"]).toHaveBeenCalledWith(
      "Write operation successfully executed",
      expect.objectContaining({consensusStatus: "ACCEPTED"}),
    );
  });

  test("uses custom RPC URL for write operations", async () => {
    const options = {args: [42, "Update"], rpc: "https://custom-rpc-url.com"};
    const mockHash = "0xMockedTransactionHash";
    const mockReceipt = {statusName: "ACCEPTED", txExecutionResultName: "FINISHED_WITH_RETURN"};

    vi.mocked(mockClient.writeContract).mockResolvedValue(mockHash);
    vi.mocked(mockClient.waitForTransactionReceipt).mockResolvedValue(mockReceipt);

    await writeAction.write({
      contractAddress: "0xMockedContract",
      method: "updateData",
      ...options,
    });

    expect(createClient).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "https://custom-rpc-url.com",
      }),
    );
    expect(mockClient.writeContract).toHaveBeenCalledWith({
      address: "0xMockedContract",
      functionName: "updateData",
      args: [42, "Update"],
      value: 0n,
    });
    expect(writeAction["succeedSpinner"]).toHaveBeenCalledWith("Write operation successfully executed", {
      ...mockReceipt,
      consensusStatus: "ACCEPTED",
    });
  });

  describe("WriteAction --wallet browser", () => {
    test("wires the browser provider into the client and never touches the keystore", async () => {
      const session = {
        signerAddress: "0xBrowser",
        eip1193Provider: {request: vi.fn()},
        setNextLabel: vi.fn(),
        close: vi.fn().mockResolvedValue(undefined),
      };
      // Lane B: getClient (BaseAction) builds the client itself. Stub the browser
      // session opener so the real getClient runs, then assert the wiring.
      const getBrowserSessionSpy = vi
        .spyOn(writeAction as any, "getBrowserSession")
        .mockResolvedValue(session);
      const getAccountSpy = vi.spyOn(writeAction as any, "getAccount");

      const mockHash = "0xMockedTransactionHash";
      const mockReceipt = {statusName: "ACCEPTED", txExecutionResultName: "FINISHED_WITH_RETURN"};
      vi.mocked(mockClient.writeContract).mockResolvedValue(mockHash);
      vi.mocked(mockClient.waitForTransactionReceipt).mockResolvedValue(mockReceipt);

      await writeAction.write({
        contractAddress: "0xC",
        method: "m",
        args: [],
        wallet: "browser",
      });

      expect(getBrowserSessionSpy).toHaveBeenCalled();
      expect(createClient).toHaveBeenCalledWith(
        expect.objectContaining({
          account: "0xBrowser",
          provider: session.eip1193Provider,
        }),
      );
      // No keystore/keychain/password path in browser mode.
      expect(getAccountSpy).not.toHaveBeenCalled();
      expect(writeAction["succeedSpinner"]).toHaveBeenCalledWith(
        "Write operation successfully executed",
        expect.objectContaining({consensusStatus: "ACCEPTED"}),
      );
    });
  });
});
