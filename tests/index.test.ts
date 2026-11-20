import {describe, it, vi, expect} from "vitest";
import {program as mockedProgram, Option} from "commander";
import {initializeCLI} from "../src/index";

vi.mock("commander", async importOriginal => ({
  ...(await importOriginal<typeof import("commander")>()),
  program: {
    version: vi.fn().mockReturnThis(),
    description: vi.fn().mockReturnThis(),
    configureHelp: vi.fn().mockReturnThis(),
    parse: vi.fn(),
  },
}));

vi.mock("../src/commands/general", () => ({
  initializeGeneralCommands: vi.fn(),
}));

vi.mock("../src/commands/account", () => ({
  initializeAccountCommands: vi.fn(),
}));

vi.mock("../src/commands/contracts", () => ({
  initializeContractsCommands: vi.fn(),
}));

vi.mock("../src/commands/config", () => ({
  initializeConfigCommands: vi.fn(),
}));

vi.mock("../src/commands/localnet", () => ({
  initializeValidatorCommands: vi.fn(),
}));

vi.mock("../src/commands/update", () => ({
  initializeUpdateCommands: vi.fn(),
}));

vi.mock("../src/commands/scaffold", () => ({
  initializeScaffoldCommands: vi.fn(),
}));

vi.mock("../src/commands/network", () => ({
  initializeNetworkCommands: vi.fn(),
}));

vi.mock("../src/commands/transactions", () => ({
  initializeTransactionsCommands: vi.fn(),
}));

vi.mock("../src/commands/staking", () => ({
  initializeStakingCommands: vi.fn(),
}));

vi.mock("../src/commands/vesting", () => ({
  initializeVestingCommands: vi.fn(),
}));

vi.mock("../src/commands/wallet", () => ({
  initializeWalletCommands: vi.fn(),
}));

vi.mock("../src/commands/balances", () => ({
  initializeBalancesCommands: vi.fn(),
}));

describe("CLI", () => {
  it("should initialize CLI", () => {
    expect(initializeCLI).not.toThrow();
  });

  it("flags mandatory options as (required) in help", () => {
    initializeCLI();
    const {optionDescription} = (mockedProgram.configureHelp as any).mock.calls.at(-1)[0];
    expect(optionDescription(new Option("--name <name>", "Name").makeOptionMandatory())).toBe("Name (required)");
    expect(optionDescription(new Option("--other <x>", "Other"))).toBe("Other");
  });
});
