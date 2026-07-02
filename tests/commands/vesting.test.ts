import {Command} from "commander";
import {vi, describe, beforeEach, afterEach, test, expect} from "vitest";
import {initializeVestingCommands} from "../../src/commands/vesting";
import {VestingAction} from "../../src/commands/vesting/VestingAction";

vi.mock("genlayer-js", () => ({
  createClient: vi.fn(),
  createAccount: vi.fn(() => ({address: "0xBeneficiary"})),
  formatStakingAmount: vi.fn((value: bigint) => `${Number(value) / 1e18} GEN`),
  parseStakingAmount: vi.fn((value: string) => {
    const lower = value.toLowerCase();
    if (lower.endsWith("gen") || lower.endsWith("eth")) {
      return BigInt(Math.trunc(Number(lower.slice(0, -3)) * 1e18));
    }
    return BigInt(value);
  }),
}));

vi.mock("genlayer-js/chains", () => ({
  localnet: {id: 1, name: "localnet", rpcUrls: {default: {http: ["http://localhost:8545"]}}},
  studionet: {id: 2, name: "studionet", rpcUrls: {default: {http: ["https://studio.genlayer.com"]}}},
  testnetAsimov: {id: 3, name: "testnet-asimov", rpcUrls: {default: {http: ["https://testnet.genlayer.com"]}}},
  testnetBradbury: {id: 4, name: "testnet-bradbury", rpcUrls: {default: {http: ["https://testnet.genlayer.com"]}}},
}));

const mockTxResult = {
  transactionHash: "0xTxHash" as `0x${string}`,
  blockNumber: 123n,
  gasUsed: 21000n,
};

const mockVestingState = {
  name: "Team grant",
  category: 1,
  beneficiary: "0xBeneficiary",
  creator: "0xCreator",
  revoker: "0xRevoker",
  factory: "0xFactory",
  addressManager: "0xAddressManager",
  totalAmount: "100 GEN",
  totalAmountRaw: 100n,
  startDate: 1710000000n,
  cliffDuration: 86400n,
  periodDuration: 604800n,
  numberOfPeriods: 12n,
  cliffUnlockBps: 1000n,
  needsManualUnlock: false,
  manualUnlocked: false,
  revoked: false,
  vestingStopped: false,
  totalWithdrawn: "10 GEN",
  totalWithdrawnRaw: 10n,
  vestedAtRevocation: "0 GEN",
  vestedAtRevocationRaw: 0n,
  totalAmountAtRevocation: "0 GEN",
  totalAmountAtRevocationRaw: 0n,
  revokedAt: 0n,
  vestingStoppedAt: 0n,
  vestedAtStop: "0 GEN",
  vestedAtStopRaw: 0n,
  postRevocationBeneficiaryRewards: "0 GEN",
  postRevocationBeneficiaryRewardsRaw: 0n,
  postRevocationBeneficiaryLosses: "0 GEN",
  postRevocationBeneficiaryLossesRaw: 0n,
  accumulatedRewards: "0 GEN",
  accumulatedRewardsRaw: 0n,
  accumulatedLosses: "0 GEN",
  accumulatedLossesRaw: 0n,
  vestedAmount: "40 GEN",
  vestedAmountRaw: 40n,
  unvestedAmount: "60 GEN",
  unvestedAmountRaw: 60n,
  withdrawableAmount: "30 GEN",
  withdrawableAmountRaw: 30n,
};

const mockClient = {
  getBeneficiaryVestings: vi.fn(),
  getVestingState: vi.fn(),
  vestingDelegatorJoin: vi.fn(),
  vestingDelegatorExit: vi.fn(),
  vestingDelegatorClaim: vi.fn(),
  vestingWithdraw: vi.fn(),
  getStakeInfo: vi.fn(),
};

describe("vesting commands", () => {
  let program: Command;
  let consoleLogSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockClient.getBeneficiaryVestings.mockResolvedValue(["0xVesting"]);
    mockClient.getVestingState.mockResolvedValue(mockVestingState);
    mockClient.vestingDelegatorJoin.mockResolvedValue({
      ...mockTxResult,
      vesting: "0xVesting",
      validator: "0xValidator",
      beneficiary: "0xBeneficiary",
      amount: "42 GEN",
      amountRaw: 42n,
    });
    mockClient.vestingDelegatorExit.mockResolvedValue(mockTxResult);
    mockClient.vestingDelegatorClaim.mockResolvedValue(mockTxResult);
    mockClient.vestingWithdraw.mockResolvedValue({
      ...mockTxResult,
      vesting: "0xVesting",
      beneficiary: "0xBeneficiary",
      amount: "10 GEN",
      amountRaw: 10n,
    });
    mockClient.getStakeInfo.mockResolvedValue({
      delegator: "0xVesting",
      validator: "0xValidator",
      shares: 50n,
      stake: "50 GEN",
      stakeRaw: 50n,
      pendingDeposits: [],
      pendingWithdrawals: [],
    });

    vi.spyOn(VestingAction.prototype as any, "getReadOnlyVestingClient").mockResolvedValue(mockClient);
    vi.spyOn(VestingAction.prototype as any, "getVestingClient").mockResolvedValue(mockClient);
    vi.spyOn(VestingAction.prototype as any, "getSignerAddress").mockResolvedValue("0xBeneficiary");
    vi.spyOn(VestingAction.prototype as any, "startSpinner").mockImplementation(() => {});
    vi.spyOn(VestingAction.prototype as any, "setSpinnerText").mockImplementation(() => {});
    vi.spyOn(VestingAction.prototype as any, "stopSpinner").mockImplementation(() => {});
    vi.spyOn(VestingAction.prototype as any, "succeedSpinner").mockImplementation(() => {});
    vi.spyOn(VestingAction.prototype as any, "failSpinner").mockImplementation(() => {});

    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    program = new Command();
    initializeVestingCommands(program);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("list fetches beneficiary vesting contracts and state", async () => {
    await program.parseAsync([
      "node",
      "test",
      "vesting",
      "list",
      "--beneficiary",
      "0xBeneficiary",
      "--factory",
      "0xFactory",
    ]);

    expect(mockClient.getBeneficiaryVestings).toHaveBeenCalledWith("0xBeneficiary", {
      factory: "0xFactory",
    });
    expect(mockClient.getVestingState).toHaveBeenCalledWith("0xVesting");
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  test("delegate resolves vesting and calls vestingDelegatorJoin", async () => {
    await program.parseAsync([
      "node",
      "test",
      "vesting",
      "delegate",
      "0xValidator",
      "--amount",
      "42gen",
    ]);

    expect(mockClient.getBeneficiaryVestings).toHaveBeenCalledWith("0xBeneficiary", undefined);
    expect(mockClient.vestingDelegatorJoin).toHaveBeenCalledWith({
      vesting: "0xVesting",
      validator: "0xValidator",
      amount: expect.any(BigInt),
    });
  });

  test("delegate accepts explicit vesting address", async () => {
    await program.parseAsync([
      "node",
      "test",
      "vesting",
      "delegate",
      "--validator",
      "0xValidator",
      "--amount",
      "42gen",
      "--vesting",
      "0xExplicitVesting",
    ]);

    expect(mockClient.getBeneficiaryVestings).not.toHaveBeenCalled();
    expect(mockClient.vestingDelegatorJoin).toHaveBeenCalledWith({
      vesting: "0xExplicitVesting",
      validator: "0xValidator",
      amount: expect.any(BigInt),
    });
  });

  test("undelegate exits all current shares", async () => {
    await program.parseAsync([
      "node",
      "test",
      "vesting",
      "undelegate",
      "0xValidator",
    ]);

    expect(mockClient.getStakeInfo).toHaveBeenCalledWith("0xVesting", "0xValidator");
    expect(mockClient.vestingDelegatorExit).toHaveBeenCalledWith({
      vesting: "0xVesting",
      validator: "0xValidator",
      shares: 50n,
    });
  });

  test("claim calls vestingDelegatorClaim", async () => {
    await program.parseAsync([
      "node",
      "test",
      "vesting",
      "claim",
      "0xValidator",
    ]);

    expect(mockClient.vestingDelegatorClaim).toHaveBeenCalledWith({
      vesting: "0xVesting",
      validator: "0xValidator",
    });
  });

  test("withdraw calls vestingWithdraw", async () => {
    await program.parseAsync([
      "node",
      "test",
      "vesting",
      "withdraw",
      "--amount",
      "10gen",
    ]);

    expect(mockClient.vestingWithdraw).toHaveBeenCalledWith({
      vesting: "0xVesting",
      amount: expect.any(BigInt),
    });
  });
});
