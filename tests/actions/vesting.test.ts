import {describe, test, vi, beforeEach, afterEach, expect} from "vitest";
import {VestingDelegateAction} from "../../src/commands/vesting/delegate";
import {VestingWithdrawAction} from "../../src/commands/vesting/withdraw";
import {VestingValidatorCreateAction} from "../../src/commands/vesting/validatorCreate";
import {VestingValidatorDepositAction} from "../../src/commands/vesting/validatorDeposit";

// Mock genlayer-js. The browser-wallet path routes writes through the SDK
// client built by getBrowserVestingClient, which we spy in each test, so
// stubbed ABIs are enough here.
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
    VESTING_ABI: [],
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

// Shared vesting browser-wallet session factory. Writes now run through the
// genlayer-js SDK client (getBrowserVestingClient), which routes
// eth_sendTransaction through `eip1193Provider`; `setNextLabel` sets the
// bridge label. Commands call `session.close()` in their finally block.
function makeVestingSession(overrides: Record<string, any> = {}) {
  return {
    signerAddress: "0xBen",
    setNextLabel: vi.fn(),
    eip1193Provider: {request: vi.fn()},
    close: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function setupVestingBrowserMocks(action: any) {
  vi.spyOn(action, "startSpinner").mockImplementation(() => {});
  vi.spyOn(action, "setSpinnerText").mockImplementation(() => {});
  vi.spyOn(action, "succeedSpinner").mockImplementation(() => {});
  vi.spyOn(action, "failSpinner").mockImplementation(() => {});
  vi.spyOn(action, "log").mockImplementation(() => {});
  // Simplest resolution: the vesting address is fixed. The browser lane calls
  // resolveBeneficiaryVesting(client, options) with the browser SDK client.
  vi.spyOn(action, "resolveBeneficiaryVesting").mockResolvedValue("0xVesting");
}

describe("VestingDelegateAction --wallet browser", () => {
  let action: VestingDelegateAction;

  beforeEach(() => {
    vi.clearAllMocks();
    action = new VestingDelegateAction();
    setupVestingBrowserMocks(action);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("routes through the browser SDK client, skips keystore client, closes session", async () => {
    const getVestingClientSpy = vi.spyOn(action as any, "getVestingClient");
    const session = makeVestingSession();
    vi.spyOn(action as any, "getVestingBrowserSession").mockResolvedValue(session);
    const mockClient = {
      vestingDelegatorJoin: vi.fn().mockResolvedValue({
        transactionHash: "0xVH",
        vesting: "0xVesting",
        validator: "0xVal",
        beneficiary: "0xBen",
        amount: "1 GEN",
        blockNumber: 9n,
        gasUsed: 8n,
      }),
    };
    vi.spyOn(action as any, "getBrowserVestingClient").mockReturnValue(mockClient);

    await action.execute({validator: "0xVal", amount: "1gen", wallet: "browser"});

    expect(mockClient.vestingDelegatorJoin).toHaveBeenCalledWith({
      vesting: "0xVesting",
      validator: "0xVal",
      amount: expect.any(BigInt),
    });
    expect(session.setNextLabel).toHaveBeenCalledWith(expect.stringContaining("Delegate"));
    expect(getVestingClientSpy).not.toHaveBeenCalled();
    expect(session.close).toHaveBeenCalledOnce();
    expect(action["succeedSpinner"]).toHaveBeenCalledWith(
      "Vesting delegation successful!",
      expect.objectContaining({
        transactionHash: "0xVH",
        vesting: "0xVesting",
        validator: "0xVal",
        beneficiary: "0xBen",
        amount: expect.any(String),
        blockNumber: "9",
        gasUsed: "8",
      }),
    );
  });

  test("closes the session even when the send fails", async () => {
    const session = makeVestingSession();
    vi.spyOn(action as any, "getVestingBrowserSession").mockResolvedValue(session);
    vi.spyOn(action as any, "getBrowserVestingClient").mockReturnValue({
      vestingDelegatorJoin: vi.fn().mockRejectedValue(new Error("Rejected in wallet")),
    });

    await action.execute({validator: "0xVal", amount: "1gen", wallet: "browser"});

    expect(action["failSpinner"]).toHaveBeenCalledWith(
      "Failed to delegate vesting tokens",
      "Rejected in wallet",
    );
    expect(session.close).toHaveBeenCalledOnce();
  });
});

describe("VestingWithdrawAction --wallet browser", () => {
  let action: VestingWithdrawAction;

  beforeEach(() => {
    vi.clearAllMocks();
    action = new VestingWithdrawAction();
    setupVestingBrowserMocks(action);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("routes through the browser SDK client, skips keystore client, closes session", async () => {
    const getVestingClientSpy = vi.spyOn(action as any, "getVestingClient");
    const session = makeVestingSession();
    vi.spyOn(action as any, "getVestingBrowserSession").mockResolvedValue(session);
    const mockClient = {
      vestingWithdraw: vi.fn().mockResolvedValue({
        transactionHash: "0xVH",
        vesting: "0xVesting",
        beneficiary: "0xBen",
        amount: "1 GEN",
        blockNumber: 9n,
        gasUsed: 8n,
      }),
    };
    vi.spyOn(action as any, "getBrowserVestingClient").mockReturnValue(mockClient);

    await action.execute({amount: "1gen", wallet: "browser"});

    expect(mockClient.vestingWithdraw).toHaveBeenCalledWith({
      vesting: "0xVesting",
      amount: expect.any(BigInt),
    });
    expect(session.setNextLabel).toHaveBeenCalledWith(expect.stringContaining("Withdraw"));
    expect(getVestingClientSpy).not.toHaveBeenCalled();
    expect(session.close).toHaveBeenCalledOnce();
    expect(action["succeedSpinner"]).toHaveBeenCalledWith(
      "Vesting withdrawal successful!",
      expect.objectContaining({
        transactionHash: "0xVH",
        vesting: "0xVesting",
        beneficiary: "0xBen",
        amount: expect.any(String),
        blockNumber: "9",
        gasUsed: "8",
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Keystore-lane self-stake minimum gate + vesting/liquid mixing hard-guard.
// The minimum is driven from the mocked epochInfo, never hardcoded.
// ---------------------------------------------------------------------------

const vestingEpochInfo = {
  currentEpoch: 7n,
  validatorMinStake: "50000 GEN",
  validatorMinStakeRaw: 50000n * BigInt(1e18),
  delegatorMinStake: "42 GEN",
  delegatorMinStakeRaw: 42n * BigInt(1e18),
};

function setupVestingKeystoreMocks(action: any, clientOverrides: Record<string, any> = {}) {
  vi.spyOn(action, "startSpinner").mockImplementation(() => {});
  vi.spyOn(action, "setSpinnerText").mockImplementation(() => {});
  vi.spyOn(action, "succeedSpinner").mockImplementation(() => {});
  vi.spyOn(action, "failSpinner").mockImplementation(() => {});
  vi.spyOn(action, "log").mockImplementation(() => {});
  vi.spyOn(action, "logInfo").mockImplementation(() => {});
  vi.spyOn(action, "logWarning").mockImplementation(() => {});
  vi.spyOn(action, "resolveBeneficiaryVesting").mockResolvedValue("0xVesting");
  const client = {
    vestingValidatorJoin: vi.fn().mockResolvedValue({
      transactionHash: "0xVH",
      vesting: "0xVesting",
      validatorWallet: "0xWallet",
      blockNumber: 1n,
      gasUsed: 2n,
    }),
    vestingValidatorDeposit: vi.fn().mockResolvedValue({transactionHash: "0xVH", blockNumber: 1n, gasUsed: 2n}),
    getValidatorWallets: vi.fn().mockResolvedValue(["0xWallet"]),
    getEpochInfo: vi.fn().mockResolvedValue(vestingEpochInfo),
    getValidatorInfo: vi.fn().mockResolvedValue({
      address: "0xWallet",
      owner: "0xVesting",
      operator: "0xOperator",
      vStake: "1000 GEN",
      vStakeRaw: 1000n * BigInt(1e18),
      dStakeRaw: 0n,
      pendingDeposits: [],
      pendingWithdrawals: [],
    }),
    isValidatorWallet: vi.fn().mockResolvedValue(true),
    ...clientOverrides,
  };
  vi.spyOn(action as any, "getVestingClient").mockResolvedValue(client);
  return client;
}

describe("VestingValidatorCreateAction self-stake minimum gate", () => {
  let action: VestingValidatorCreateAction;

  beforeEach(() => {
    vi.clearAllMocks();
    action = new VestingValidatorCreateAction();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("blocks a create below the minimum without --force", async () => {
    const client = setupVestingKeystoreMocks(action);

    await action.execute({operator: "0xOperator", amount: "100gen"});

    expect(client.vestingValidatorJoin).not.toHaveBeenCalled();
    const [msg, detail] = (action["failSpinner"] as any).mock.calls[0];
    expect(msg).toBe("Failed to create vesting-backed validator");
    expect(detail).toContain(vestingEpochInfo.validatorMinStake);
    expect(detail).toContain("--force");
  });

  test("proceeds with --force below the minimum", async () => {
    const client = setupVestingKeystoreMocks(action);

    await action.execute({operator: "0xOperator", amount: "100gen", force: true});

    expect(client.vestingValidatorJoin).toHaveBeenCalledTimes(1);
    expect(action["failSpinner"]).not.toHaveBeenCalled();
  });
});

describe("VestingValidatorDepositAction mixing guard", () => {
  let action: VestingValidatorDepositAction;

  beforeEach(() => {
    vi.clearAllMocks();
    action = new VestingValidatorDepositAction();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("hard-blocks a vesting deposit into a wallet not created by this vesting contract", async () => {
    const client = setupVestingKeystoreMocks(action, {isValidatorWallet: vi.fn().mockResolvedValue(false)});

    // Even with --force: the mixing guard is not overridable (tx would revert).
    await action.execute({walletAddress: "0xLiquidWallet", amount: "100gen", force: true});

    expect(client.vestingValidatorDeposit).not.toHaveBeenCalled();
    const [msg, detail] = (action["failSpinner"] as any).mock.calls[0];
    expect(msg).toBe("Failed to deposit vesting validator tokens");
    expect(detail).toContain("staking validator-deposit");
  });

  test("blocks a vesting deposit below the minimum without --force", async () => {
    const client = setupVestingKeystoreMocks(action); // isValidatorWallet true, vStake 1000 GEN
    await action.execute({walletAddress: "0xWallet", amount: "100gen"});

    expect(client.vestingValidatorDeposit).not.toHaveBeenCalled();
    const [msg, detail] = (action["failSpinner"] as any).mock.calls[0];
    expect(msg).toBe("Failed to deposit vesting validator tokens");
    expect(detail).toContain(vestingEpochInfo.validatorMinStake);
  });
});
