import {Command} from "commander";
import {vi, describe, beforeEach, afterEach, test, expect} from "vitest";
import {initializeVestingCommands} from "../../src/commands/vesting";
import {VestingAction} from "../../src/commands/vesting/VestingAction";
import {VestingDelegateAction} from "../../src/commands/vesting/delegate";
import {VestingValidatorDepositAction} from "../../src/commands/vesting/validatorDeposit";

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
  vestingValidatorJoin: vi.fn(),
  vestingValidatorDeposit: vi.fn(),
  vestingValidatorExit: vi.fn(),
  vestingValidatorClaim: vi.fn(),
  vestingValidatorInitiateOperatorTransfer: vi.fn(),
  vestingValidatorCompleteOperatorTransfer: vi.fn(),
  vestingValidatorCancelOperatorTransfer: vi.fn(),
  vestingValidatorSetIdentity: vi.fn(),
  getValidatorWallets: vi.fn(),
  validatorWalletCount: vi.fn(),
  validatorDeposited: vi.fn(),
  isValidatorWallet: vi.fn(),
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
    mockClient.vestingValidatorJoin.mockResolvedValue({
      ...mockTxResult,
      vesting: "0xVesting",
      validatorWallet: "0xWallet",
      operator: "0xOperator",
      beneficiary: "0xBeneficiary",
      amount: "42 GEN",
      amountRaw: 42n,
    });
    mockClient.vestingValidatorDeposit.mockResolvedValue(mockTxResult);
    mockClient.vestingValidatorExit.mockResolvedValue(mockTxResult);
    mockClient.vestingValidatorClaim.mockResolvedValue(mockTxResult);
    mockClient.vestingValidatorInitiateOperatorTransfer.mockResolvedValue(mockTxResult);
    mockClient.vestingValidatorCompleteOperatorTransfer.mockResolvedValue(mockTxResult);
    mockClient.vestingValidatorCancelOperatorTransfer.mockResolvedValue(mockTxResult);
    mockClient.vestingValidatorSetIdentity.mockResolvedValue(mockTxResult);
    mockClient.getValidatorWallets.mockResolvedValue(["0xWallet"]);
    mockClient.validatorWalletCount.mockResolvedValue(1n);
    mockClient.validatorDeposited.mockResolvedValue(42n);
    mockClient.isValidatorWallet.mockResolvedValue(true);
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

  test("validator create calls vestingValidatorJoin", async () => {
    await program.parseAsync([
      "node",
      "test",
      "vesting",
      "validator",
      "create",
      "0xOperator",
      "--amount",
      "42gen",
    ]);

    expect(mockClient.vestingValidatorJoin).toHaveBeenCalledWith({
      vesting: "0xVesting",
      operator: "0xOperator",
      amount: expect.any(BigInt),
    });
  });

  test("validator join accepts operator option and explicit vesting address", async () => {
    await program.parseAsync([
      "node",
      "test",
      "vesting",
      "validator",
      "join",
      "--operator",
      "0xOperator",
      "--amount",
      "42gen",
      "--vesting",
      "0xExplicitVesting",
    ]);

    expect(mockClient.getBeneficiaryVestings).not.toHaveBeenCalled();
    expect(mockClient.vestingValidatorJoin).toHaveBeenCalledWith({
      vesting: "0xExplicitVesting",
      operator: "0xOperator",
      amount: expect.any(BigInt),
    });
  });

  test("validator deposit calls vestingValidatorDeposit", async () => {
    await program.parseAsync([
      "node",
      "test",
      "vesting",
      "validator",
      "deposit",
      "0xWallet",
      "--amount",
      "10gen",
    ]);

    expect(mockClient.vestingValidatorDeposit).toHaveBeenCalledWith({
      vesting: "0xVesting",
      wallet: "0xWallet",
      amount: expect.any(BigInt),
    });
  });

  test("validator exit calls vestingValidatorExit", async () => {
    await program.parseAsync([
      "node",
      "test",
      "vesting",
      "validator",
      "exit",
      "0xWallet",
      "--shares",
      "100",
    ]);

    expect(mockClient.vestingValidatorExit).toHaveBeenCalledWith({
      vesting: "0xVesting",
      wallet: "0xWallet",
      shares: 100n,
    });
  });

  test("validator claim calls vestingValidatorClaim", async () => {
    await program.parseAsync([
      "node",
      "test",
      "vesting",
      "validator",
      "claim",
      "0xWallet",
    ]);

    expect(mockClient.vestingValidatorClaim).toHaveBeenCalledWith({
      vesting: "0xVesting",
      wallet: "0xWallet",
    });
  });

  test("validator operator-transfer initiate calls SDK action", async () => {
    await program.parseAsync([
      "node",
      "test",
      "vesting",
      "validator",
      "operator-transfer",
      "initiate",
      "0xWallet",
      "0xNewOperator",
    ]);

    expect(mockClient.vestingValidatorInitiateOperatorTransfer).toHaveBeenCalledWith({
      vesting: "0xVesting",
      wallet: "0xWallet",
      newOperator: "0xNewOperator",
    });
  });

  test("validator operator-transfer complete calls SDK action", async () => {
    await program.parseAsync([
      "node",
      "test",
      "vesting",
      "validator",
      "operator-transfer",
      "complete",
      "0xWallet",
    ]);

    expect(mockClient.vestingValidatorCompleteOperatorTransfer).toHaveBeenCalledWith({
      vesting: "0xVesting",
      wallet: "0xWallet",
    });
  });

  test("validator operator-transfer cancel calls SDK action", async () => {
    await program.parseAsync([
      "node",
      "test",
      "vesting",
      "validator",
      "operator-transfer",
      "cancel",
      "0xWallet",
    ]);

    expect(mockClient.vestingValidatorCancelOperatorTransfer).toHaveBeenCalledWith({
      vesting: "0xVesting",
      wallet: "0xWallet",
    });
  });

  test("validator set-identity calls vestingValidatorSetIdentity with empty-string defaults", async () => {
    await program.parseAsync([
      "node",
      "test",
      "vesting",
      "validator",
      "set-identity",
      "0xWallet",
      "--moniker",
      "My Validator",
      "--website",
      "https://example.com",
      "--twitter",
      "myhandle",
    ]);

    expect(mockClient.vestingValidatorSetIdentity).toHaveBeenCalledWith({
      vesting: "0xVesting",
      wallet: "0xWallet",
      moniker: "My Validator",
      logoUri: "",
      website: "https://example.com",
      description: "",
      email: "",
      twitter: "myhandle",
      telegram: "",
      github: "",
      extraCid: expect.any(String),
    });
  });

  test("validator list fetches wallets and deposited amounts", async () => {
    await program.parseAsync([
      "node",
      "test",
      "vesting",
      "validator",
      "list",
      "--vesting",
      "0xVesting",
    ]);

    expect(mockClient.getBeneficiaryVestings).not.toHaveBeenCalled();
    expect(mockClient.getValidatorWallets).toHaveBeenCalledWith("0xVesting");
    expect(mockClient.validatorDeposited).toHaveBeenCalledWith("0xVesting", "0xWallet");
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  test("validator status resolves vesting from beneficiary", async () => {
    await program.parseAsync([
      "node",
      "test",
      "vesting",
      "validator",
      "status",
      "--beneficiary",
      "0xBeneficiary",
    ]);

    expect(mockClient.getBeneficiaryVestings).toHaveBeenCalledWith("0xBeneficiary", undefined);
    expect(mockClient.getValidatorWallets).toHaveBeenCalledWith("0xVesting");
  });

  test("delegate parses --wallet browser into the signing mode", async () => {
    // Spy execute directly so parsing is asserted without opening a real browser
    // session (the browser path is unit-tested in tests/actions/vesting.test.ts).
    const executeSpy = vi
      .spyOn(VestingDelegateAction.prototype as any, "execute")
      .mockResolvedValue(undefined);

    await program.parseAsync([
      "node",
      "test",
      "vesting",
      "delegate",
      "0xValidator",
      "--amount",
      "42gen",
      "--wallet",
      "browser",
    ]);

    expect(executeSpy).toHaveBeenCalledWith(
      expect.objectContaining({wallet: "browser", validator: "0xValidator"}),
    );
  });

  test("delegate leaves --wallet unset when omitted (keystore resolved in the action)", async () => {
    const executeSpy = vi
      .spyOn(VestingDelegateAction.prototype as any, "execute")
      .mockResolvedValue(undefined);

    await program.parseAsync(["node", "test", "vesting", "delegate", "0xValidator", "--amount", "42gen"]);

    // No commander default: the omitted flag is undefined; the effective mode
    // (keystore, unless walletMode=browser config) is resolved in resolveWalletMode.
    expect((executeSpy.mock.calls[0][0] as any).wallet).toBeUndefined();
  });

  test("validator deposit routes the deprecated --validator-wallet flag to walletAddress", async () => {
    const executeSpy = vi
      .spyOn(VestingValidatorDepositAction.prototype as any, "execute")
      .mockResolvedValue(undefined);

    await program.parseAsync([
      "node",
      "test",
      "vesting",
      "validator",
      "deposit",
      "--validator-wallet",
      "0xWallet",
      "--amount",
      "1gen",
    ]);

    // The deprecated --validator-wallet flag supplies the address; --wallet
    // (signing mode) must not be interpreted as the wallet address.
    const depositArg = executeSpy.mock.calls[0][0] as any;
    expect(depositArg.walletAddress).toBe("0xWallet");
    expect(depositArg.wallet).toBeUndefined();
  });
});
