import {describe, test, vi, beforeEach, afterEach, expect} from "vitest";
import {ValidatorJoinAction} from "../../src/commands/staking/validatorJoin";
import {ValidatorDepositAction} from "../../src/commands/staking/validatorDeposit";
import {ValidatorExitAction} from "../../src/commands/staking/validatorExit";
import {ValidatorClaimAction} from "../../src/commands/staking/validatorClaim";
import {DelegatorJoinAction} from "../../src/commands/staking/delegatorJoin";
import {DelegatorExitAction} from "../../src/commands/staking/delegatorExit";
import {DelegatorClaimAction} from "../../src/commands/staking/delegatorClaim";
import {SetOperatorAction} from "../../src/commands/staking/setOperator";
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
    VALIDATOR_WALLET_ABI: [],
  },
}));

// buildTx is used by the browser-wallet paths of ValidatorDeposit/SetOperator/
// DelegatorClaim. The genlayer-js mock stubs the ABIs with [], so mock the pure
// tx-builder helper too (real behavior covered in tests/libs/txBuilders.test.ts).
vi.mock("../../src/lib/wallet/txBuilders", () => ({
  buildTx: vi.fn(() => ({to: "0xTarget", data: "0xdata"})),
}));

vi.mock("genlayer-js/chains", () => ({
  localnet: {id: 1, name: "localnet", rpcUrls: {default: {http: ["http://localhost:8545"]}}},
  studionet: {id: 2, name: "studionet", rpcUrls: {default: {http: ["https://studionet.genlayer.com"]}}},
  testnetAsimov: {
    id: 3,
    name: "testnet-asimov",
    rpcUrls: {default: {http: ["https://testnet.genlayer.com"]}},
  },
  testnetBradbury: {
    id: 4,
    name: "testnet-bradbury",
    rpcUrls: {default: {http: ["https://testnet.genlayer.com"]}},
  },
}));

// The genlayer-js mock above stubs `abi` with an empty ABI, so mock the pure
// tx-builder module (its real behavior is covered in tests/libs/stakingTx.test.ts).
vi.mock("../../src/lib/wallet/stakingTx", () => ({
  buildValidatorJoinTx: vi.fn(() => ({to: "0xStaking", data: "0xdata"})),
  buildSetIdentityTx: vi.fn(() => ({to: "0xValidatorWallet", data: "0xidentity"})),
  extractValidatorWallet: vi.fn(() => "0xValidatorWalletFromEvent"),
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
  getEpochData: vi.fn(),
  getActiveValidators: vi.fn(),
  formatStakingAmount: vi.fn((val: bigint) => `${Number(val) / 1e18} GEN`),
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
    expect(action["succeedSpinner"]).toHaveBeenCalledWith(
      "Validator created successfully!",
      expect.any(Object),
    );
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

// ValidatorDepositAction, ValidatorExitAction, ValidatorClaimAction tests
// are covered by command-level tests. These actions now use viem directly
// to call ValidatorWallet contracts and require complex viem mocking.

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
    expect(action["succeedSpinner"]).toHaveBeenCalledWith(
      "Successfully joined as delegator!",
      expect.any(Object),
    );
  });
});

describe("DelegatorExitAction", () => {
  let action: DelegatorExitAction;

  beforeEach(() => {
    vi.clearAllMocks();
    action = new DelegatorExitAction();
    setupActionMocks(action);
    mockClient.delegatorExit.mockResolvedValue(mockTxResult);
    mockClient.getEpochInfo.mockResolvedValue(mockEpochInfo);
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

    expect(mockClient.delegatorClaim).toHaveBeenCalledWith({
      validator: "0xValidator",
      delegator: "0xDelegator",
    });
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
    mockClient.getEpochData.mockResolvedValue({
      start: BigInt(Math.floor(Date.now() / 1000) - 3600),
      end: 0n,
      vcount: 5n,
      weight: 100000n,
      inflation: 1000n * BigInt(1e18),
      claimed: 500n * BigInt(1e18),
      slashed: 0n,
    });
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

    expect(action["succeedSpinner"]).toHaveBeenCalledWith("Epoch info");
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

describe("ValidatorJoinAction --wallet browser", () => {
  let action: ValidatorJoinAction;
  const mockReceipt = {
    transactionHash: "0xBrowserHash",
    blockNumber: 456n,
    gasUsed: 30000n,
    status: "success",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    action = new ValidatorJoinAction();
    vi.spyOn(action as any, "startSpinner").mockImplementation(() => {});
    vi.spyOn(action as any, "setSpinnerText").mockImplementation(() => {});
    vi.spyOn(action as any, "succeedSpinner").mockImplementation(() => {});
    vi.spyOn(action as any, "failSpinner").mockImplementation(() => {});
    vi.spyOn(action as any, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("routes through the browser session and never touches the keystore", async () => {
    const getStakingClientSpy = vi.spyOn(action as any, "getStakingClient");
    const getSignerAddressSpy = vi.spyOn(action as any, "getSignerAddress");
    // The command's finally calls session.close() (no-op for remote daemon
    // sessions, full close for an own bridge) — not session.bridge.close().
    const close = vi.fn().mockResolvedValue(undefined);
    const sendTransaction = vi.fn().mockResolvedValue(mockReceipt);
    vi.spyOn(action as any, "getBrowserWalletSession").mockResolvedValue({
      bridge: {close: vi.fn()},
      close,
      stakingAddress: "0xStaking",
      signerAddress: "0xBrowserOwner",
      sendTransaction,
    });

    await action.execute({amount: "42000gen", wallet: "browser", stakingAddress: "0xStaking"});

    expect((action as any).getBrowserWalletSession).toHaveBeenCalledWith(
      expect.any(Object),
      "validator-join",
    );
    expect(sendTransaction).toHaveBeenCalledOnce();
    expect(getStakingClientSpy).not.toHaveBeenCalled();
    expect(getSignerAddressSpy).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();

    // Output shape matches the keystore path.
    expect(action["succeedSpinner"]).toHaveBeenCalledWith(
      "Validator created successfully!",
      expect.objectContaining({
        transactionHash: "0xBrowserHash",
        validatorWallet: "0xValidatorWalletFromEvent",
        operator: "0xBrowserOwner",
        blockNumber: "456",
        gasUsed: "30000",
      }),
    );
  });

  test("closes the session even when the send fails", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(action as any, "getBrowserWalletSession").mockResolvedValue({
      bridge: {close: vi.fn()},
      close,
      stakingAddress: "0xStaking",
      signerAddress: "0xBrowserOwner",
      sendTransaction: vi.fn().mockRejectedValue(new Error("Transaction rejected in wallet")),
    });

    await action.execute({amount: "42000gen", wallet: "browser", stakingAddress: "0xStaking"});

    expect(action["failSpinner"]).toHaveBeenCalledWith(
      "Failed to create validator",
      "Transaction rejected in wallet",
    );
    expect(close).toHaveBeenCalledOnce();
  });

  test("rejects --wallet browser combined with --password", async () => {
    await action.execute({amount: "42000gen", wallet: "browser", password: "hunter2"});

    expect(action["failSpinner"]).toHaveBeenCalledWith(
      "Failed to create validator",
      "--password cannot be used with --wallet browser",
    );
  });

  test("rejects --wallet browser combined with --account", async () => {
    await action.execute({amount: "42000gen", wallet: "browser", account: "owner"});

    expect(action["failSpinner"]).toHaveBeenCalledWith(
      "Failed to create validator",
      "--account selects a keystore; not applicable with --wallet browser",
    );
  });
});

// Shared factory for a staking browser-wallet session. These commands call
// `session.close()` (not session.bridge.close()) in their finally block.
function makeBrowserSession(overrides: Record<string, any> = {}) {
  return {
    bridge: {close: vi.fn()},
    stakingAddress: "0xStaking",
    signerAddress: "0xBrowserOwner",
    sendTransaction: vi.fn().mockResolvedValue({
      transactionHash: "0xBH",
      blockNumber: 5n,
      gasUsed: 6n,
      status: "success",
    }),
    close: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function setupBrowserActionMocks(action: any) {
  vi.spyOn(action, "startSpinner").mockImplementation(() => {});
  vi.spyOn(action, "setSpinnerText").mockImplementation(() => {});
  vi.spyOn(action, "succeedSpinner").mockImplementation(() => {});
  vi.spyOn(action, "failSpinner").mockImplementation(() => {});
  vi.spyOn(action, "log").mockImplementation(() => {});
}

describe("ValidatorDepositAction --wallet browser", () => {
  let action: ValidatorDepositAction;

  beforeEach(() => {
    vi.clearAllMocks();
    action = new ValidatorDepositAction();
    setupBrowserActionMocks(action);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("routes through the browser session, skips keystore, closes session", async () => {
    const getStakingClientSpy = vi.spyOn(action as any, "getStakingClient");
    const getReadOnlyStakingClientSpy = vi.spyOn(action as any, "getReadOnlyStakingClient");
    const getSignerAddressSpy = vi.spyOn(action as any, "getSignerAddress");
    const session = makeBrowserSession();
    vi.spyOn(action as any, "getBrowserWalletSession").mockResolvedValue(session);

    await action.execute({validator: "0xVW", amount: "1gen", wallet: "browser"});

    expect(session.sendTransaction).toHaveBeenCalledOnce();
    expect(getStakingClientSpy).not.toHaveBeenCalled();
    expect(getReadOnlyStakingClientSpy).not.toHaveBeenCalled();
    expect(getSignerAddressSpy).not.toHaveBeenCalled();
    expect(session.close).toHaveBeenCalledOnce();
    expect(action["succeedSpinner"]).toHaveBeenCalledWith(
      "Deposit successful!",
      expect.objectContaining({
        transactionHash: "0xBH",
        validator: "0xVW",
        amount: expect.any(String),
        blockNumber: "5",
        gasUsed: "6",
      }),
    );
  });

  test("closes the session even when the send fails", async () => {
    const session = makeBrowserSession({
      sendTransaction: vi.fn().mockRejectedValue(new Error("Rejected in wallet")),
    });
    vi.spyOn(action as any, "getBrowserWalletSession").mockResolvedValue(session);

    await action.execute({validator: "0xVW", amount: "1gen", wallet: "browser"});

    expect(action["failSpinner"]).toHaveBeenCalledWith("Failed to make deposit", "Rejected in wallet");
    expect(session.close).toHaveBeenCalledOnce();
  });

  test("rejects --wallet browser combined with --password", async () => {
    vi.spyOn(action as any, "getBrowserWalletSession").mockRejectedValue(
      new Error("--password cannot be used with --wallet browser"),
    );

    await action.execute({validator: "0xVW", amount: "1gen", wallet: "browser", password: "x"});

    expect(action["failSpinner"]).toHaveBeenCalledWith(
      "Failed to make deposit",
      expect.stringContaining("--password cannot be used with --wallet browser"),
    );
  });
});

describe("SetOperatorAction --wallet browser", () => {
  let action: SetOperatorAction;

  beforeEach(() => {
    vi.clearAllMocks();
    action = new SetOperatorAction();
    setupBrowserActionMocks(action);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("routes through the browser session, skips keystore, closes session", async () => {
    const getStakingClientSpy = vi.spyOn(action as any, "getStakingClient");
    const getReadOnlyStakingClientSpy = vi.spyOn(action as any, "getReadOnlyStakingClient");
    const getSignerAddressSpy = vi.spyOn(action as any, "getSignerAddress");
    const session = makeBrowserSession();
    vi.spyOn(action as any, "getBrowserWalletSession").mockResolvedValue(session);

    await action.execute({validator: "0xVW", operator: "0xOp", wallet: "browser"});

    expect(session.sendTransaction).toHaveBeenCalledOnce();
    expect(getStakingClientSpy).not.toHaveBeenCalled();
    expect(getReadOnlyStakingClientSpy).not.toHaveBeenCalled();
    expect(getSignerAddressSpy).not.toHaveBeenCalled();
    expect(session.close).toHaveBeenCalledOnce();
    expect(action["succeedSpinner"]).toHaveBeenCalledWith(
      "Operator updated!",
      expect.objectContaining({
        transactionHash: "0xBH",
        validator: "0xVW",
        newOperator: "0xOp",
        blockNumber: "5",
        gasUsed: "6",
      }),
    );
  });
});

describe("DelegatorClaimAction --wallet browser", () => {
  let action: DelegatorClaimAction;

  beforeEach(() => {
    vi.clearAllMocks();
    action = new DelegatorClaimAction();
    setupBrowserActionMocks(action);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("routes through the browser session, defaults delegator to session signer", async () => {
    const getStakingClientSpy = vi.spyOn(action as any, "getStakingClient");
    const getReadOnlyStakingClientSpy = vi.spyOn(action as any, "getReadOnlyStakingClient");
    const getSignerAddressSpy = vi.spyOn(action as any, "getSignerAddress");
    const session = makeBrowserSession();
    vi.spyOn(action as any, "getBrowserWalletSession").mockResolvedValue(session);

    await action.execute({validator: "0xVal", wallet: "browser"});

    expect(session.sendTransaction).toHaveBeenCalledOnce();
    expect(getStakingClientSpy).not.toHaveBeenCalled();
    expect(getReadOnlyStakingClientSpy).not.toHaveBeenCalled();
    // Browser mode reads the connected wallet from the session, never the keystore.
    expect(getSignerAddressSpy).not.toHaveBeenCalled();
    expect(session.close).toHaveBeenCalledOnce();
    expect(action["succeedSpinner"]).toHaveBeenCalledWith(
      "Claim successful!",
      expect.objectContaining({
        transactionHash: "0xBH",
        delegator: "0xBrowserOwner",
        validator: "0xVal",
        blockNumber: "5",
        gasUsed: "6",
      }),
    );
  });
});
