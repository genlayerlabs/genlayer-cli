import {Command} from "commander";
import {vi, describe, beforeEach, afterEach, test, expect} from "vitest";
import {initializeBalancesCommands} from "../../src/commands/balances";
import {VestingAction} from "../../src/commands/vesting/VestingAction";
import {BalancesAction} from "../../src/commands/balances/BalancesAction";

vi.mock("genlayer-js", () => ({
  createClient: vi.fn(),
  createAccount: vi.fn(() => ({address: "0xBeneficiary"})),
  formatStakingAmount: vi.fn((value: bigint) => `${Number(value) / 1e18} GEN`),
  parseStakingAmount: vi.fn((value: string) => BigInt(value)),
}));

vi.mock("genlayer-js/chains", () => ({
  localnet: {id: 1, name: "localnet", rpcUrls: {default: {http: ["http://localhost:8545"]}}},
  studionet: {id: 2, name: "studionet", rpcUrls: {default: {http: ["https://studio.genlayer.com"]}}},
  testnetAsimov: {id: 3, name: "testnet-asimov", rpcUrls: {default: {http: ["https://testnet.genlayer.com"]}}},
  testnetBradbury: {id: 4, name: "testnet-bradbury", rpcUrls: {default: {http: ["https://testnet.genlayer.com"]}}},
}));

const mockClient = {
  getBalance: vi.fn(),
  getBeneficiaryVestings: vi.fn(),
  getVestingState: vi.fn(),
  getValidatorWallets: vi.fn(),
  validatorDeposited: vi.fn(),
  getActiveValidators: vi.fn(),
  getQuarantinedValidatorsDetailed: vi.fn(),
  getBannedValidators: vi.fn(),
  vestingDepositedPerValidator: vi.fn(),
};

describe("balances command", () => {
  let program: Command;
  let consoleLogSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockClient.getBalance.mockResolvedValue(0n);
    mockClient.getBeneficiaryVestings.mockResolvedValue([]);
    mockClient.getActiveValidators.mockResolvedValue([]);
    mockClient.getQuarantinedValidatorsDetailed.mockResolvedValue([]);
    mockClient.getBannedValidators.mockResolvedValue([]);

    vi.spyOn(VestingAction.prototype as any, "getReadOnlyVestingClient").mockResolvedValue(mockClient);
    vi.spyOn(VestingAction.prototype as any, "getSignerAddress").mockResolvedValue("0xBeneficiary");
    vi.spyOn(BalancesAction.prototype as any, "startSpinner").mockImplementation(() => {});
    vi.spyOn(BalancesAction.prototype as any, "setSpinnerText").mockImplementation(() => {});
    vi.spyOn(BalancesAction.prototype as any, "stopSpinner").mockImplementation(() => {});
    vi.spyOn(BalancesAction.prototype as any, "failSpinner").mockImplementation(() => {});

    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    program = new Command();
    initializeBalancesCommands(program);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("--beneficiary queries that address and renders output", async () => {
    await program.parseAsync(["node", "test", "balances", "--beneficiary", "0xExplicit"]);

    expect(mockClient.getBalance).toHaveBeenCalledWith({address: "0xExplicit"});
    expect(mockClient.getBeneficiaryVestings).toHaveBeenCalledWith("0xExplicit", undefined);
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  test("defaults to the active account address without unlocking", async () => {
    await program.parseAsync(["node", "test", "balances"]);

    expect(mockClient.getBalance).toHaveBeenCalledWith({address: "0xBeneficiary"});
    expect(mockClient.getBeneficiaryVestings).toHaveBeenCalledWith("0xBeneficiary", undefined);
  });
});
