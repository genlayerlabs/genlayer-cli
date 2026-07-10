import {describe, test, vi, beforeEach, afterEach, expect} from "vitest";
import {ValidatorJoinAction} from "../../src/commands/staking/validatorJoin";
import {ValidatorDepositAction} from "../../src/commands/staking/validatorDeposit";
import {ValidatorExitAction} from "../../src/commands/staking/validatorExit";
import {ValidatorClaimAction} from "../../src/commands/staking/validatorClaim";
import {DelegatorJoinAction} from "../../src/commands/staking/delegatorJoin";
import {DelegatorExitAction} from "../../src/commands/staking/delegatorExit";
import {DelegatorClaimAction} from "../../src/commands/staking/delegatorClaim";
import {SetOperatorAction} from "../../src/commands/staking/setOperator";
import {SetIdentityAction} from "../../src/commands/staking/setIdentity";
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
  setOperator: vi.fn(),
  setIdentity: vi.fn(),
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

// ValidatorDepositAction / ValidatorExitAction: keystore path goes through the
// SDK staking client (client.validatorDeposit / client.validatorExit), matching
// every other staking command. Previously these two used raw viem
// writeContract, which fails on the GenLayer consensus RPC (no EIP-1559 fee
// support) — see fix in validatorDeposit.ts / validatorExit.ts.
describe("ValidatorDepositAction", () => {
  let action: ValidatorDepositAction;

  beforeEach(() => {
    vi.clearAllMocks();
    action = new ValidatorDepositAction();
    setupActionMocks(action);
    mockClient.validatorDeposit.mockResolvedValue(mockTxResult);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("deposits to validator via the SDK client (not raw viem)", async () => {
    await action.execute({validator: "0xValidatorWallet", amount: "10gen", stakingAddress: "0xStaking"});

    expect(mockClient.validatorDeposit).toHaveBeenCalledWith({
      validator: "0xValidatorWallet",
      amount: expect.any(BigInt),
    });
    expect(action["succeedSpinner"]).toHaveBeenCalledWith("Deposit successful!", expect.any(Object));
  });

  test("handles errors", async () => {
    mockClient.validatorDeposit.mockRejectedValue(new Error("deposit failed"));

    await action.execute({validator: "0xValidatorWallet", amount: "10gen", stakingAddress: "0xStaking"});

    expect(action["failSpinner"]).toHaveBeenCalledWith("Failed to make deposit", "deposit failed");
  });
});

describe("ValidatorExitAction", () => {
  let action: ValidatorExitAction;

  beforeEach(() => {
    vi.clearAllMocks();
    action = new ValidatorExitAction();
    setupActionMocks(action);
    mockClient.validatorExit.mockResolvedValue(mockTxResult);
    mockClient.getEpochInfo.mockResolvedValue(mockEpochInfo);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("exits validator via the SDK client (not raw viem)", async () => {
    await action.execute({validator: "0xValidatorWallet", shares: "50", stakingAddress: "0xStaking"});

    expect(mockClient.validatorExit).toHaveBeenCalledWith({
      validator: "0xValidatorWallet",
      shares: 50n,
    });
    expect(action["succeedSpinner"]).toHaveBeenCalledWith("Exit initiated successfully!", expect.any(Object));
  });

  test("rejects a non-positive shares value before calling the client", async () => {
    await action.execute({validator: "0xValidatorWallet", shares: "0", stakingAddress: "0xStaking"});

    expect(mockClient.validatorExit).not.toHaveBeenCalled();
    expect(action["failSpinner"]).toHaveBeenCalledWith(
      'Invalid shares value: "0". Must be a positive whole number.',
    );
  });

  test("handles errors", async () => {
    mockClient.validatorExit.mockRejectedValue(new Error("exit failed"));

    await action.execute({validator: "0xValidatorWallet", shares: "50", stakingAddress: "0xStaking"});

    expect(action["failSpinner"]).toHaveBeenCalledWith("Failed to exit", "exit failed");
  });
});

// SetOperatorAction / ValidatorClaimAction / SetIdentityAction: keystore path
// goes through the SDK staking client (client.setOperator / validatorClaim /
// setIdentity), matching every other staking write. Previously these used raw
// viem writeContract, which fails on the GenLayer consensus RPC (no EIP-1559
// fee support). getViemClients has been removed entirely, so routing through
// the SDK is the only path.
describe("SetOperatorAction", () => {
  let action: SetOperatorAction;

  beforeEach(() => {
    vi.clearAllMocks();
    action = new SetOperatorAction();
    setupActionMocks(action);
    mockClient.setOperator.mockResolvedValue(mockTxResult);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("sets operator via the SDK client (not raw viem)", async () => {
    await action.execute({
      validator: "0xValidatorWallet",
      operator: "0xNewOperator",
      stakingAddress: "0xStaking",
    });

    expect(mockClient.setOperator).toHaveBeenCalledWith({
      validator: "0xValidatorWallet",
      operator: "0xNewOperator",
    });
    expect(action["succeedSpinner"]).toHaveBeenCalledWith("Operator updated!", expect.any(Object));
  });

  test("handles errors", async () => {
    mockClient.setOperator.mockRejectedValue(new Error("set operator failed"));

    await action.execute({
      validator: "0xValidatorWallet",
      operator: "0xNewOperator",
      stakingAddress: "0xStaking",
    });

    expect(action["failSpinner"]).toHaveBeenCalledWith("Failed to set operator", "set operator failed");
  });
});

describe("ValidatorClaimAction", () => {
  let action: ValidatorClaimAction;

  beforeEach(() => {
    vi.clearAllMocks();
    action = new ValidatorClaimAction();
    setupActionMocks(action);
    mockClient.validatorClaim.mockResolvedValue({...mockTxResult, claimedAmount: 5n * BigInt(1e18)});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("claims via the SDK client (not raw viem) and surfaces claimedAmount", async () => {
    await action.execute({validator: "0xValidatorWallet", stakingAddress: "0xStaking"});

    expect(mockClient.validatorClaim).toHaveBeenCalledWith({validator: "0xValidatorWallet"});
    expect(action["succeedSpinner"]).toHaveBeenCalledWith(
      "Claim successful!",
      expect.objectContaining({claimedAmount: expect.any(String)}),
    );
  });

  test("handles errors", async () => {
    mockClient.validatorClaim.mockRejectedValue(new Error("claim failed"));

    await action.execute({validator: "0xValidatorWallet", stakingAddress: "0xStaking"});

    expect(action["failSpinner"]).toHaveBeenCalledWith("Failed to claim", "claim failed");
  });
});

describe("SetIdentityAction", () => {
  let action: SetIdentityAction;

  beforeEach(() => {
    vi.clearAllMocks();
    action = new SetIdentityAction();
    setupActionMocks(action);
    mockClient.setIdentity.mockResolvedValue(mockTxResult);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("sets identity via the SDK client (SDK owns extraCid encoding)", async () => {
    await action.execute({
      validator: "0xValidatorWallet",
      moniker: "MyValidator",
      website: "https://example.com",
      extraCid: "ipfs://cid",
      stakingAddress: "0xStaking",
    });

    expect(mockClient.setIdentity).toHaveBeenCalledWith({
      validator: "0xValidatorWallet",
      moniker: "MyValidator",
      logoUri: undefined,
      website: "https://example.com",
      description: undefined,
      email: undefined,
      twitter: undefined,
      telegram: undefined,
      github: undefined,
      extraCid: "ipfs://cid",
    });
    expect(action["succeedSpinner"]).toHaveBeenCalledWith("Validator identity set!", expect.any(Object));
  });

  test("handles errors", async () => {
    mockClient.setIdentity.mockRejectedValue(new Error("set identity failed"));

    await action.execute({validator: "0xValidatorWallet", moniker: "MyValidator", stakingAddress: "0xStaking"});

    expect(action["failSpinner"]).toHaveBeenCalledWith("Failed to set identity", "set identity failed");
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

  test("validator-info honors a live wallet session over the keystore default", async () => {
    mockClient.isValidator.mockResolvedValue(false);
    // A session is live and no keystore opt-out → resolveWalletMode → browser.
    vi.spyOn(action as any, "resolveWalletMode").mockReturnValue("browser");
    const sessionSpy = vi.spyOn(action as any, "liveSessionAddress").mockResolvedValue("0xSession");
    const signerSpy = vi.spyOn(action as any, "getSignerAddress").mockResolvedValue("0xKeystore");

    await action.getValidatorInfo({stakingAddress: "0xStaking"});

    // The connected session address, not the keystore default, is queried.
    expect(mockClient.isValidator).toHaveBeenCalledWith("0xSession");
    expect(sessionSpy).toHaveBeenCalled();
    expect(signerSpy).not.toHaveBeenCalled();
  });

  test("validator-info: explicit [validator] overrides a live session", async () => {
    mockClient.isValidator.mockResolvedValue(false);
    const sessionSpy = vi.spyOn(action as any, "liveSessionAddress").mockResolvedValue("0xSession");

    await action.getValidatorInfo({validator: "0xExplicit", stakingAddress: "0xStaking"});

    expect(mockClient.isValidator).toHaveBeenCalledWith("0xExplicit");
    // Explicit override short-circuits before the session is ever consulted.
    expect(sessionSpy).not.toHaveBeenCalled();
  });

  test("delegation-info honors a live wallet session over the keystore default", async () => {
    mockClient.getStakeInfo.mockResolvedValue({
      delegator: "0xSession",
      validator: "0xValidator",
      shares: 0n,
      stake: "0 GEN",
      stakeRaw: 0n,
      pendingDeposits: [],
      pendingWithdrawals: [],
    });
    vi.spyOn(action as any, "resolveWalletMode").mockReturnValue("browser");
    const sessionSpy = vi.spyOn(action as any, "liveSessionAddress").mockResolvedValue("0xSession");
    const signerSpy = vi.spyOn(action as any, "getSignerAddress").mockResolvedValue("0xKeystore");

    await action.getStakeInfo({validator: "0xValidator", stakingAddress: "0xStaking"});

    expect(mockClient.getStakeInfo).toHaveBeenCalledWith("0xSession", "0xValidator");
    expect(sessionSpy).toHaveBeenCalled();
    expect(signerSpy).not.toHaveBeenCalled();
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
  const mockBrowserJoinResult = {
    transactionHash: "0xBrowserHash",
    blockNumber: 456n,
    gasUsed: 30000n,
    validatorWallet: "0xValidatorWalletFromEvent",
    operator: "0xBrowserOwner",
    amount: "42000 GEN",
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

  test("routes through the browser SDK client and never touches the keystore", async () => {
    const getStakingClientSpy = vi.spyOn(action as any, "getStakingClient");
    const getSignerAddressSpy = vi.spyOn(action as any, "getSignerAddress");
    // The command's finally calls session.close() (no-op for remote daemon
    // sessions, full close for an own bridge) — not session.bridge.close().
    const session = makeBrowserSession();
    vi.spyOn(action as any, "getBrowserWalletSession").mockResolvedValue(session);
    // Browser writes run the SAME SDK call as the keystore lane; the client is
    // built by getBrowserStakingClient (synchronous — Address account + provider).
    const mockBrowserClient = {validatorJoin: vi.fn().mockResolvedValue(mockBrowserJoinResult)};
    vi.spyOn(action as any, "getBrowserStakingClient").mockReturnValue(mockBrowserClient);

    await action.execute({amount: "42000gen", wallet: "browser", stakingAddress: "0xStaking"});

    expect((action as any).getBrowserWalletSession).toHaveBeenCalledWith(
      expect.any(Object),
      "validator-join",
    );
    expect(mockBrowserClient.validatorJoin).toHaveBeenCalledWith({
      amount: expect.any(BigInt),
      operator: undefined,
    });
    expect(session.setNextLabel).toHaveBeenCalledWith(expect.stringContaining("Join as validator"));
    expect(getStakingClientSpy).not.toHaveBeenCalled();
    expect(getSignerAddressSpy).not.toHaveBeenCalled();
    expect(session.close).toHaveBeenCalledOnce();

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
    const session = makeBrowserSession();
    vi.spyOn(action as any, "getBrowserWalletSession").mockResolvedValue(session);
    vi.spyOn(action as any, "getBrowserStakingClient").mockReturnValue({
      validatorJoin: vi.fn().mockRejectedValue(new Error("Transaction rejected in wallet")),
    });

    await action.execute({amount: "42000gen", wallet: "browser", stakingAddress: "0xStaking"});

    expect(action["failSpinner"]).toHaveBeenCalledWith(
      "Failed to create validator",
      "Transaction rejected in wallet",
    );
    expect(session.close).toHaveBeenCalledOnce();
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

// Shared factory for a staking browser-wallet session. Writes now run through
// the genlayer-js SDK client (getBrowserStakingClient) which routes
// eth_sendTransaction through `eip1193Provider`; `setNextLabel` sets the
// human-readable bridge label. These commands call `session.close()` (not
// session.bridge.close()) in their finally block.
function makeBrowserSession(overrides: Record<string, any> = {}) {
  return {
    bridge: {close: vi.fn()},
    stakingAddress: "0xStaking",
    signerAddress: "0xBrowserOwner",
    setNextLabel: vi.fn(),
    eip1193Provider: {request: vi.fn()},
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

  test("routes through the browser SDK client, skips keystore, closes session", async () => {
    const getStakingClientSpy = vi.spyOn(action as any, "getStakingClient");
    const getReadOnlyStakingClientSpy = vi.spyOn(action as any, "getReadOnlyStakingClient");
    const getSignerAddressSpy = vi.spyOn(action as any, "getSignerAddress");
    const session = makeBrowserSession();
    vi.spyOn(action as any, "getBrowserWalletSession").mockResolvedValue(session);
    const mockClient = {
      validatorDeposit: vi.fn().mockResolvedValue({transactionHash: "0xBH", blockNumber: 5n, gasUsed: 6n}),
    };
    vi.spyOn(action as any, "getBrowserStakingClient").mockReturnValue(mockClient);

    await action.execute({validator: "0xVW", amount: "1gen", wallet: "browser"});

    expect(mockClient.validatorDeposit).toHaveBeenCalledWith({
      validator: "0xVW",
      amount: expect.any(BigInt),
    });
    expect(session.setNextLabel).toHaveBeenCalledWith(expect.stringContaining("Deposit"));
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
    const session = makeBrowserSession();
    vi.spyOn(action as any, "getBrowserWalletSession").mockResolvedValue(session);
    vi.spyOn(action as any, "getBrowserStakingClient").mockReturnValue({
      validatorDeposit: vi.fn().mockRejectedValue(new Error("Rejected in wallet")),
    });

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

  test("routes through the browser SDK client, skips keystore, closes session", async () => {
    const getStakingClientSpy = vi.spyOn(action as any, "getStakingClient");
    const getReadOnlyStakingClientSpy = vi.spyOn(action as any, "getReadOnlyStakingClient");
    const getSignerAddressSpy = vi.spyOn(action as any, "getSignerAddress");
    const session = makeBrowserSession();
    vi.spyOn(action as any, "getBrowserWalletSession").mockResolvedValue(session);
    const mockClient = {
      setOperator: vi.fn().mockResolvedValue({transactionHash: "0xBH", blockNumber: 5n, gasUsed: 6n}),
    };
    vi.spyOn(action as any, "getBrowserStakingClient").mockReturnValue(mockClient);

    await action.execute({validator: "0xVW", operator: "0xOp", wallet: "browser"});

    expect(mockClient.setOperator).toHaveBeenCalledWith({validator: "0xVW", operator: "0xOp"});
    expect(session.setNextLabel).toHaveBeenCalledWith(expect.stringContaining("Set operator to 0xOp"));
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

  test("routes through the browser SDK client, defaults delegator to session signer", async () => {
    const getStakingClientSpy = vi.spyOn(action as any, "getStakingClient");
    const getReadOnlyStakingClientSpy = vi.spyOn(action as any, "getReadOnlyStakingClient");
    const getSignerAddressSpy = vi.spyOn(action as any, "getSignerAddress");
    const session = makeBrowserSession();
    vi.spyOn(action as any, "getBrowserWalletSession").mockResolvedValue(session);
    const mockClient = {
      delegatorClaim: vi.fn().mockResolvedValue({transactionHash: "0xBH", blockNumber: 5n, gasUsed: 6n}),
    };
    vi.spyOn(action as any, "getBrowserStakingClient").mockReturnValue(mockClient);

    await action.execute({validator: "0xVal", wallet: "browser"});

    // Delegator defaults to the connected session signer, never the keystore.
    expect(mockClient.delegatorClaim).toHaveBeenCalledWith({
      validator: "0xVal",
      delegator: "0xBrowserOwner",
    });
    expect(session.setNextLabel).toHaveBeenCalledWith(expect.stringContaining("Claim delegator withdrawals"));
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
