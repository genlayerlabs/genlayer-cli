import {describe, test, vi, beforeEach, afterEach, expect} from "vitest";
import {VestingDelegateAction} from "../../src/commands/vesting/delegate";
import {VestingWithdrawAction} from "../../src/commands/vesting/withdraw";

// Mock genlayer-js. The browser-wallet path builds calldata via the mocked
// txBuilders helper below, so stubbed ABIs are enough here.
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

// The genlayer-js mock stubs `abi` with empty ABIs, so mock the pure tx-builder
// module (real behavior is covered in tests/libs/txBuilders.test.ts).
vi.mock("../../src/lib/wallet/txBuilders", () => ({
  buildTx: vi.fn(() => ({to: "0xVesting", data: "0xdata"})),
}));

// Shared vesting browser-wallet session factory. Commands call `session.close()`
// in their finally block.
function makeVestingSession(overrides: Record<string, any> = {}) {
  return {
    signerAddress: "0xBen",
    sendTransaction: vi.fn().mockResolvedValue({
      transactionHash: "0xVH",
      blockNumber: 9n,
      gasUsed: 8n,
    }),
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
  // Read-only client used to resolve the beneficiary vesting; account-less.
  vi.spyOn(action, "getReadOnlyVestingClient").mockResolvedValue({
    getBeneficiaryVestings: vi.fn().mockResolvedValue(["0xVesting"]),
  });
  // Simplest resolution: the vesting address is fixed.
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

  test("routes through the browser session, skips keystore client, closes session", async () => {
    const getVestingClientSpy = vi.spyOn(action as any, "getVestingClient");
    const session = makeVestingSession();
    vi.spyOn(action as any, "getVestingBrowserSession").mockResolvedValue(session);

    await action.execute({validator: "0xVal", amount: "1gen", wallet: "browser"});

    expect(session.sendTransaction).toHaveBeenCalledOnce();
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
    const session = makeVestingSession({
      sendTransaction: vi.fn().mockRejectedValue(new Error("Rejected in wallet")),
    });
    vi.spyOn(action as any, "getVestingBrowserSession").mockResolvedValue(session);

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

  test("routes through the browser session, skips keystore client, closes session", async () => {
    const getVestingClientSpy = vi.spyOn(action as any, "getVestingClient");
    const session = makeVestingSession();
    vi.spyOn(action as any, "getVestingBrowserSession").mockResolvedValue(session);

    await action.execute({amount: "1gen", wallet: "browser"});

    expect(session.sendTransaction).toHaveBeenCalledOnce();
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
