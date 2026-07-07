import {describe, test, vi, beforeEach, afterEach, expect} from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {createClient, createAccount, deriveInternalMessageCallKey} from "genlayer-js";
import {EstimateFeesAction} from "../../src/commands/contracts/estimateFees";

vi.mock("genlayer-js");

describe("EstimateFeesAction", () => {
  let action: EstimateFeesAction;
  const mockClient = {
    initializeConsensusSmartContract: vi.fn(),
    estimateTransactionFees: vi.fn(),
    estimateTransactionFeesForWrite: vi.fn(),
    simulateWriteContract: vi.fn(),
    estimateTransactionFeesFromSimulation: vi.fn(),
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
    vi.mocked(deriveInternalMessageCallKey).mockImplementation(
      (methodName = "") =>
        `0x${Buffer.from(methodName, "utf8").toString("hex").padEnd(64, "0")}` as `0x${string}`,
    );
    action = new EstimateFeesAction();
    vi.spyOn(action as any, "getAccount").mockResolvedValue({privateKey: mockPrivateKey});
    vi.spyOn(action as any, "startSpinner").mockImplementation(() => {});
    vi.spyOn(action as any, "succeedSpinner").mockImplementation(() => {});
    vi.spyOn(action as any, "failSpinner").mockImplementation(() => {});
    vi.spyOn(action as any, "setSpinnerText").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("builds a static fee estimate", async () => {
    const estimate = {
      distribution: {leaderTimeunitsAllocation: 100n, rotations: [0n]},
      feeValue: 1100n,
      policy: {enabled: true},
    };
    vi.mocked(mockClient.estimateTransactionFees).mockResolvedValue(estimate);

    await action.estimate({
      fees: JSON.stringify({
        distribution: {
          leaderTimeunitsAllocation: "100",
          rotations: ["0"],
        },
      }),
    });

    expect(mockClient.estimateTransactionFees).toHaveBeenCalledWith({
      leaderTimeunitsAllocation: "100",
      rotations: ["0"],
    });
    expect(mockClient.simulateWriteContract).not.toHaveBeenCalled();
    expect(action["succeedSpinner"]).toHaveBeenCalledWith("Fee estimate generated", {
      distribution: {leaderTimeunitsAllocation: "100", rotations: ["0"]},
      feeValue: "1100",
      policy: {enabled: true},
    });
  });

  test("builds a static fee estimate from the deploy fee profile entry", async () => {
    const profilePath = writeFeeProfile({
      version: 1,
      network: "localnet",
      deploy: {
        leaderTimeunitsAllocation: "100",
        validatorTimeunitsAllocation: "200",
        executionBudgetPerRound: "300",
        totalMessageFees: "0",
        rotationsPerRound: "1",
      },
      methods: {},
    });
    const estimate = {
      distribution: {
        leaderTimeunitsAllocation: 100n,
        validatorTimeunitsAllocation: 200n,
        executionBudgetPerRound: 300n,
        totalMessageFees: 0n,
        appealRounds: 1n,
        rotations: [1n, 1n],
      },
      feeValue: 1700n,
    };
    vi.mocked(mockClient.estimateTransactionFees).mockResolvedValue(estimate);

    await action.estimate({feeProfile: profilePath});

    expect(mockClient.estimateTransactionFees).toHaveBeenCalledWith({
      leaderTimeunitsAllocation: "100",
      validatorTimeunitsAllocation: "200",
      executionBudgetPerRound: "300",
      totalMessageFees: "0",
      appealRounds: "1",
      rotations: ["1", "1"],
    });
    expect(action["succeedSpinner"]).toHaveBeenCalledWith("Fee estimate generated", {
      distribution: {
        leaderTimeunitsAllocation: "100",
        validatorTimeunitsAllocation: "200",
        executionBudgetPerRound: "300",
        totalMessageFees: "0",
        appealRounds: "1",
        rotations: ["1", "1"],
      },
      feeValue: "1700",
    });
  });

  test("prints a static fee estimate as JSON without spinner output", async () => {
    const estimate = {
      distribution: {leaderTimeunitsAllocation: 100n, rotations: [0n]},
      feeValue: 1100n,
      policy: {enabled: true},
    };
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.mocked(mockClient.estimateTransactionFees).mockResolvedValue(estimate);

    await action.estimate({json: true});

    expect(action["startSpinner"]).not.toHaveBeenCalled();
    expect(action["succeedSpinner"]).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      JSON.stringify({
        distribution: {leaderTimeunitsAllocation: "100", rotations: ["0"]},
        feeValue: "1100",
        policy: {enabled: true},
      }),
    );
  });

  test("derives a fee estimate for a target write through the SDK one-call helper", async () => {
    const finalEstimate = {
      distribution: {leaderTimeunitsAllocation: 100n, totalMessageFees: 110n, rotations: [0n]},
      messageAllocations: [{messageType: 1, budget: 110n}],
      feeValue: 1310n,
      observed: {messageFeeBudget: 110n, messageFeeConsumed: 55n},
      policy: {enabled: true},
    };
    vi.mocked(mockClient.estimateTransactionFeesForWrite).mockResolvedValue(finalEstimate);

    await action.estimate({
      contractAddress: "0x0000000000000000000000000000000000000001",
      method: "update",
      args: ["after"],
      fees: JSON.stringify({
        messageAllocations: [
          {
            messageType: "internal",
            callKeyMethod: "settle_campaign",
            budget: "110",
          },
        ],
      }),
    });

    expect(mockClient.estimateTransactionFeesForWrite).toHaveBeenCalledWith({
      messageAllocations: [
        {
          messageType: 1,
          callKey: `0x${Buffer.from("settle_campaign", "utf8").toString("hex").padEnd(64, "0")}`,
          budget: "110",
        },
      ],
      address: "0x0000000000000000000000000000000000000001",
      functionName: "update",
      args: ["after"],
    });
    expect(mockClient.estimateTransactionFees).not.toHaveBeenCalled();
    expect(mockClient.simulateWriteContract).not.toHaveBeenCalled();
    expect(mockClient.estimateTransactionFeesFromSimulation).not.toHaveBeenCalled();
    expect(action["succeedSpinner"]).toHaveBeenCalledWith("Fee estimate generated", {
      distribution: {leaderTimeunitsAllocation: "100", totalMessageFees: "110", rotations: ["0"]},
      messageAllocations: [{messageType: 1, budget: "110"}],
      feeValue: "1310",
      observed: {messageFeeBudget: "110", messageFeeConsumed: "55"},
      policy: {enabled: true},
    });
  });

  test("derives a target write fee estimate from the matching method fee profile entry", async () => {
    const profilePath = writeFeeProfile({
      version: 1,
      network: "localnet",
      methods: {
        update: {
          leaderTimeunitsAllocation: "100",
          validatorTimeunitsAllocation: "200",
          executionBudgetPerRound: "300",
          totalMessageFees: "55",
          rotationsPerRound: "1",
        },
      },
    });
    const finalEstimate = {
      distribution: {
        leaderTimeunitsAllocation: 100n,
        totalMessageFees: 80n,
        appealRounds: 2n,
        rotations: [1n, 1n, 1n],
      },
      messageAllocations: [{messageType: 1, budget: 80n}],
      feeValue: 1780n,
    };
    vi.mocked(mockClient.estimateTransactionFeesForWrite).mockResolvedValue(finalEstimate);

    await action.estimate({
      contractAddress: "0x0000000000000000000000000000000000000001",
      method: "update",
      args: ["after"],
      feeProfile: profilePath,
      feePreset: "high",
      fees: JSON.stringify({
        totalMessageFees: "80",
        messageAllocations: [
          {
            messageType: "internal",
            callKeyMethod: "settle_campaign",
            budget: "80",
          },
        ],
      }),
    });

    expect(mockClient.estimateTransactionFeesForWrite).toHaveBeenCalledWith({
      leaderTimeunitsAllocation: "100",
      validatorTimeunitsAllocation: "200",
      executionBudgetPerRound: "300",
      totalMessageFees: "80",
      appealRounds: "2",
      rotations: ["1", "1", "1"],
      messageAllocations: [
        {
          messageType: 1,
          callKey: `0x${Buffer.from("settle_campaign", "utf8").toString("hex").padEnd(64, "0")}`,
          budget: "80",
        },
      ],
      address: "0x0000000000000000000000000000000000000001",
      functionName: "update",
      args: ["after"],
    });
    expect(action["succeedSpinner"]).toHaveBeenCalledWith("Fee estimate generated", {
      distribution: {
        leaderTimeunitsAllocation: "100",
        totalMessageFees: "80",
        appealRounds: "2",
        rotations: ["1", "1", "1"],
      },
      messageAllocations: [{messageType: 1, budget: "80"}],
      feeValue: "1780",
    });
  });

  test("falls back to explicit simulation when the SDK one-call helper is unavailable", async () => {
    const legacyClient = {
      ...mockClient,
      estimateTransactionFeesForWrite: undefined,
    };
    vi.mocked(createClient).mockReturnValue(legacyClient as any);
    const initialEstimate = {
      distribution: {leaderTimeunitsAllocation: 100n, rotations: [0n]},
      messageAllocations: [{messageType: 1, budget: 55n}],
      feeValue: 1200n,
      policy: {enabled: true},
    };
    const simulation = {feeAccounting: {status: "active"}};
    const finalEstimate = {
      distribution: {leaderTimeunitsAllocation: 100n, totalMessageFees: 55n, rotations: [0n]},
      messageAllocations: [{messageType: 1, budget: 55n}],
      feeValue: 1255n,
      observed: {messageFeeConsumed: 55n},
      policy: {enabled: true},
    };
    vi.mocked(mockClient.estimateTransactionFees).mockResolvedValue(initialEstimate);
    vi.mocked(mockClient.simulateWriteContract).mockResolvedValue(simulation);
    vi.mocked(mockClient.estimateTransactionFeesFromSimulation).mockResolvedValue(finalEstimate);

    await action.estimate({
      contractAddress: "0x0000000000000000000000000000000000000001",
      method: "update",
      args: ["after"],
      fees: JSON.stringify({
        messageAllocations: [{messageType: "internal", budget: "55"}],
      }),
    });

    expect(mockClient.estimateTransactionFees).toHaveBeenCalledWith({
      messageAllocations: [{messageType: 1, budget: "55"}],
    });
    expect(mockClient.simulateWriteContract).toHaveBeenCalledWith({
      address: "0x0000000000000000000000000000000000000001",
      functionName: "update",
      args: ["after"],
      includeReceipt: true,
      fees: {
        distribution: initialEstimate.distribution,
        messageAllocations: initialEstimate.messageAllocations,
        feeValue: initialEstimate.feeValue,
      },
    });
    expect(mockClient.estimateTransactionFeesFromSimulation).toHaveBeenCalledWith({
      messageAllocations: [{messageType: 1, budget: "55"}],
      simulation,
    });
    expect(action["succeedSpinner"]).toHaveBeenCalledWith("Fee estimate generated", {
      distribution: {leaderTimeunitsAllocation: "100", totalMessageFees: "55", rotations: ["0"]},
      messageAllocations: [{messageType: 1, budget: "55"}],
      feeValue: "1255",
      observed: {messageFeeConsumed: "55"},
      policy: {enabled: true},
    });
  });

  test("includes simulation fee report when requested", async () => {
    const initialEstimate = {
      distribution: {leaderTimeunitsAllocation: 100n, rotations: [0n]},
      messageAllocations: [{messageType: 1, budget: 55n}],
      feeValue: 1200n,
      policy: {enabled: true},
    };
    const simulation = {
      feeAccounting: {
        status: "active",
        message_fee_budget: 55n,
        message_fee_consumed: 55n,
        execution_fee_report: {
          messageFees: {
            budget: 55n,
            declaredConsumed: 55n,
            remaining: 0n,
          },
        },
      },
      feeReport: {
        totalEstimatedFee: 501664n,
      },
    };
    const finalEstimate = {
      distribution: {leaderTimeunitsAllocation: 100n, totalMessageFees: 55n, rotations: [0n]},
      messageAllocations: [{messageType: 1, budget: 55n}],
      feeValue: 1255n,
      observed: {messageFeeConsumed: 55n},
      policy: {enabled: true},
    };
    vi.mocked(mockClient.estimateTransactionFees).mockResolvedValue(initialEstimate);
    vi.mocked(mockClient.simulateWriteContract).mockResolvedValue(simulation);
    vi.mocked(mockClient.estimateTransactionFeesFromSimulation).mockResolvedValue(finalEstimate);

    await action.estimate({
      contractAddress: "0x0000000000000000000000000000000000000001",
      method: "update",
      args: ["after"],
      includeReport: true,
      fees: JSON.stringify({
        messageAllocations: [{messageType: "internal", budget: "55"}],
      }),
    });

    expect(mockClient.estimateTransactionFeesForWrite).not.toHaveBeenCalled();
    expect(mockClient.simulateWriteContract).toHaveBeenCalledWith({
      address: "0x0000000000000000000000000000000000000001",
      functionName: "update",
      args: ["after"],
      includeReceipt: true,
      fees: {
        distribution: initialEstimate.distribution,
        messageAllocations: initialEstimate.messageAllocations,
        feeValue: initialEstimate.feeValue,
      },
    });
    expect(action["succeedSpinner"]).toHaveBeenCalledWith("Fee estimate generated", {
      distribution: {leaderTimeunitsAllocation: "100", totalMessageFees: "55", rotations: ["0"]},
      messageAllocations: [{messageType: 1, budget: "55"}],
      feeValue: "1255",
      observed: {messageFeeConsumed: "55"},
      policy: {enabled: true},
      simulation: {
        feeAccounting: {
          status: "active",
          message_fee_budget: "55",
          message_fee_consumed: "55",
          execution_fee_report: {
            messageFees: {
              budget: "55",
              declaredConsumed: "55",
              remaining: "0",
            },
          },
        },
        feeReport: {
          totalEstimatedFee: "501664",
        },
      },
    });
  });
});
