import {describe, test, vi, beforeEach, afterEach, expect} from "vitest";
import {ValidatorJoinAction} from "../../src/commands/staking/validatorJoin";
import {ValidatorDepositAction} from "../../src/commands/staking/validatorDeposit";
import {ValidatorExitAction} from "../../src/commands/staking/validatorExit";
import {ValidatorClaimAction} from "../../src/commands/staking/validatorClaim";
import {DelegatorJoinAction} from "../../src/commands/staking/delegatorJoin";
import {DelegatorExitAction} from "../../src/commands/staking/delegatorExit";
import {DelegatorClaimAction} from "../../src/commands/staking/delegatorClaim";
import {StakingInfoAction} from "../../src/commands/staking/stakingInfo";

// Mock genlayer-js
vi.mock("genlayer-js", () => ({
  createClient: vi.fn(),
  createAccount: vi.fn(() => ({address: "0xMockedAddress"})),
  formatStakingAmount: vi.fn((val: bigint) => `${Number(val) / 1e18} GEN`),
  parseStakingAmount: vi.fn((val: string) => {
    if (val.toLowerCase().endsWith("gen") || val.toLowerCase().endsWith("eth")) {
      return BigInt(parseFloat(val.slice(0, -3)) * 1e18);
    }
    return BigInt(val);
  }),
  abi: {
    STAKING_ABI: [],
  },
}));

vi.mock("genlayer-js/chains", () => ({
  localnet: {id: 1, name: "localnet", rpcUrls: {default: {http: ["http://localhost:8545"]}}},
  testnetAsimov: {id: 2, name: "testnet-asimov", rpcUrls: {default: {http: ["https://testnet.genlayer.com"]}}},
}));

const mockTxResult = {
  transactionHash: "0xMockedHash" as `0x${string}`,
  blockNumber: 123n,
  gasUsed: 21000n,
};

const mockValidatorJoinResult = {
  ...mockTxResult,
  validatorWallet: "0xValidatorWallet",
  operator: "0xOperator",
  amount: "42000 GEN",
  amountRaw: 42000n * BigInt(1e18),
};

const mockDelegatorJoinResult = {
  ...mockTxResult,
  validator: "0xValidator",
  delegator: "0xDelegator",
  amount: "42 GEN",
  amountRaw: 42n * BigInt(1e18),
};

const mockClient = {
  validatorJoin: vi.fn(),
  validatorDeposit: vi.fn(),
  validatorExit: vi.fn(),
  validatorClaim: vi.fn(),
  delegatorJoin: vi.fn(),
  delegatorExit: vi.fn(),
  delegatorClaim: vi.fn(),
  isValidator: vi.fn(),
  getValidatorInfo: vi.fn(),
  getStakeInfo: vi.fn(),
  getEpochInfo: vi.fn(),
  getActiveValidators: vi.fn(),
};

function setupActionMocks(action: any) {
  vi.spyOn(action as any, "getStakingClient").mockResolvedValue(mockClient);
  vi.spyOn(action as any, "getReadOnlyStakingClient").mockResolvedValue(mockClient);
  vi.spyOn(action as any, "getSignerAddress").mockResolvedValue("0xMockedSigner");
  vi.spyOn(action as any, "startSpinner").mockImplementation(() => {});
  vi.spyOn(action as any, "setSpinnerText").mockImplementation(() => {});
  vi.spyOn(action as any, "succeedSpinner").mockImplementation(() => {});
  vi.spyOn(action as any, "failSpinner").mockImplementation(() => {});
}

describe("ValidatorJoinAction", () => {
  let action: ValidatorJoinAction;

  beforeEach(() => {
    vi.clearAllMocks();
    action = new ValidatorJoinAction();
    setupActionMocks(action);
    mockClient.validatorJoin.mockResolvedValue(mockValidatorJoinResult);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("joins as validator without operator", async () => {
    await action.execute({amount: "42000gen", stakingAddress: "0xStaking"});

    expect(mockClient.validatorJoin).toHaveBeenCalledWith({
      amount: expect.any(BigInt),
      operator: undefined,
    });
    expect(action["succeedSpinner"]).toHaveBeenCalledWith("Validator created successfully!", expect.any(Object));
  });

  test("joins as validator with operator", async () => {
    await action.execute({amount: "42000gen", operator: "0xOperator", stakingAddress: "0xStaking"});

    expect(mockClient.validatorJoin).toHaveBeenCalledWith({
      amount: expect.any(BigInt),
      operator: "0xOperator",
    });
  });

  test("handles errors", async () => {
    mockClient.validatorJoin.mockRejectedValue(new Error("Join failed"));

    await action.execute({amount: "42000gen", stakingAddress: "0xStaking"});

    expect(action["failSpinner"]).toHaveBeenCalledWith("Failed to create validator", "Join failed");
  });
});

describe("ValidatorDepositAction", () => {
  let action: ValidatorDepositAction;

  beforeEach(() => {
    vi.clearAllMocks();
    action = new ValidatorDepositAction();
    setupActionMocks(action);
    mockClient.validatorDeposit.mockResolvedValue(mockTxResult);
  });

  test("deposits successfully", async () => {
    await action.execute({amount: "1000gen", stakingAddress: "0xStaking"});

    expect(mockClient.validatorDeposit).toHaveBeenCalledWith({amount: expect.any(BigInt)});
    expect(action["succeedSpinner"]).toHaveBeenCalledWith("Deposit successful!", expect.any(Object));
  });
});

describe("ValidatorExitAction", () => {
  let action: ValidatorExitAction;

  beforeEach(() => {
    vi.clearAllMocks();
    action = new ValidatorExitAction();
    setupActionMocks(action);
    mockClient.validatorExit.mockResolvedValue(mockTxResult);
  });

  test("exits successfully", async () => {
    await action.execute({shares: "100", stakingAddress: "0xStaking"});

    expect(mockClient.validatorExit).toHaveBeenCalledWith({shares: 100n});
    expect(action["succeedSpinner"]).toHaveBeenCalledWith("Exit initiated successfully!", expect.any(Object));
  });
});

describe("ValidatorClaimAction", () => {
  let action: ValidatorClaimAction;

  beforeEach(() => {
    vi.clearAllMocks();
    action = new ValidatorClaimAction();
    setupActionMocks(action);
    mockClient.validatorClaim.mockResolvedValue({...mockTxResult, claimedAmount: 0n});
  });

  test("claims successfully", async () => {
    await action.execute({validator: "0xValidator", stakingAddress: "0xStaking"});

    expect(mockClient.validatorClaim).toHaveBeenCalledWith({validator: "0xValidator"});
    expect(action["succeedSpinner"]).toHaveBeenCalledWith("Claim successful!", expect.any(Object));
  });

  test("uses signer address if no validator specified", async () => {
    await action.execute({stakingAddress: "0xStaking"});

    expect(mockClient.validatorClaim).toHaveBeenCalledWith({validator: "0xMockedSigner"});
  });
});

describe("DelegatorJoinAction", () => {
  let action: DelegatorJoinAction;

  beforeEach(() => {
    vi.clearAllMocks();
    action = new DelegatorJoinAction();
    setupActionMocks(action);
    mockClient.delegatorJoin.mockResolvedValue(mockDelegatorJoinResult);
  });

  test("joins as delegator successfully", async () => {
    await action.execute({validator: "0xValidator", amount: "42gen", stakingAddress: "0xStaking"});

    expect(mockClient.delegatorJoin).toHaveBeenCalledWith({
      validator: "0xValidator",
      amount: expect.any(BigInt),
    });
    expect(action["succeedSpinner"]).toHaveBeenCalledWith("Successfully joined as delegator!", expect.any(Object));
  });
});

describe("DelegatorExitAction", () => {
  let action: DelegatorExitAction;

  beforeEach(() => {
    vi.clearAllMocks();
    action = new DelegatorExitAction();
    setupActionMocks(action);
    mockClient.delegatorExit.mockResolvedValue(mockTxResult);
  });

  test("exits successfully", async () => {
    await action.execute({validator: "0xValidator", shares: "50", stakingAddress: "0xStaking"});

    expect(mockClient.delegatorExit).toHaveBeenCalledWith({validator: "0xValidator", shares: 50n});
    expect(action["succeedSpinner"]).toHaveBeenCalledWith("Exit initiated successfully!", expect.any(Object));
  });
});

describe("DelegatorClaimAction", () => {
  let action: DelegatorClaimAction;

  beforeEach(() => {
    vi.clearAllMocks();
    action = new DelegatorClaimAction();
    setupActionMocks(action);
    mockClient.delegatorClaim.mockResolvedValue(mockTxResult);
  });

  test("claims successfully", async () => {
    await action.execute({validator: "0xValidator", delegator: "0xDelegator", stakingAddress: "0xStaking"});

    expect(mockClient.delegatorClaim).toHaveBeenCalledWith({validator: "0xValidator", delegator: "0xDelegator"});
    expect(action["succeedSpinner"]).toHaveBeenCalledWith("Claim successful!", expect.any(Object));
  });
});

const mockEpochInfo = {
  currentEpoch: 10n,
  currentEpochStart: new Date("2024-01-01T00:00:00Z"),
  currentEpochEnd: new Date("2024-01-01T01:00:00Z"),
  nextEpochEstimate: new Date("2024-01-01T02:00:00Z"),
  epochMinDuration: 3600n,
  validatorMinStake: "42000 GEN",
  validatorMinStakeRaw: 42000n * BigInt(1e18),
  delegatorMinStake: "42 GEN",
  delegatorMinStakeRaw: 42n * BigInt(1e18),
  activeValidatorsCount: 5n,
  inflation: "1000 GEN",
  inflationRaw: 1000n * BigInt(1e18),
  totalWeight: 100000n * BigInt(1e18),
  totalClaimed: "500 GEN",
  totalClaimedRaw: 500n * BigInt(1e18),
};

describe("StakingInfoAction", () => {
  let action: StakingInfoAction;

  beforeEach(() => {
    vi.clearAllMocks();
    action = new StakingInfoAction();
    setupActionMocks(action);
    mockClient.getEpochInfo.mockResolvedValue(mockEpochInfo);
  });

  test("gets validator info", async () => {
    mockClient.isValidator.mockResolvedValue(true);
    mockClient.getValidatorInfo.mockResolvedValue({
      address: "0xValidator",
      owner: "0xOwner",
      operator: "0xOperator",
      vStake: "1000 GEN",
      vStakeRaw: 1000n,
      vShares: 100n,
      dStake: "500 GEN",
      dStakeRaw: 500n,
      dShares: 50n,
      vDeposit: "0 GEN",
      vDepositRaw: 0n,
      vWithdrawal: "0 GEN",
      vWithdrawalRaw: 0n,
      ePrimed: 5n,
      needsPriming: false,
      live: true,
      banned: false,
      bannedEpoch: null,
      pendingDeposits: [],
      pendingWithdrawals: [],
      identity: null,
    });

    await action.getValidatorInfo({validator: "0xValidator", stakingAddress: "0xStaking"});

    expect(mockClient.isValidator).toHaveBeenCalledWith("0xValidator");
    expect(action["succeedSpinner"]).toHaveBeenCalledWith("Validator info retrieved", expect.any(Object));
  });

  test("fails if not a validator", async () => {
    mockClient.isValidator.mockResolvedValue(false);

    await action.getValidatorInfo({validator: "0xNotValidator", stakingAddress: "0xStaking"});

    expect(action["failSpinner"]).toHaveBeenCalledWith("Address 0xNotValidator is not a validator");
  });

  test("gets epoch info", async () => {
    await action.getEpochInfo({stakingAddress: "0xStaking"});

    expect(action["succeedSpinner"]).toHaveBeenCalledWith("Epoch info retrieved", expect.any(Object));
  });

  test("lists active validators", async () => {
    mockClient.getActiveValidators.mockResolvedValue(["0xV1", "0xV2", "0xV3"]);

    await action.listActiveValidators({stakingAddress: "0xStaking"});

    expect(action["succeedSpinner"]).toHaveBeenCalledWith("Active validators retrieved", {
      count: 3,
      validators: ["0xV1", "0xV2", "0xV3"],
    });
  });
});
