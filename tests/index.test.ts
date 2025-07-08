import {describe, it, vi, expect} from "vitest";
import {initializeCLI} from "../src/index";

vi.mock("commander", () => ({
  program: {
    version: vi.fn().mockReturnThis(),
    description: vi.fn().mockReturnThis(),
    parse: vi.fn(),
  },
}));

vi.mock("../src/commands/general", () => ({
  initializeGeneralCommands: vi.fn(),
}));

vi.mock("../src/commands/keygen", () => ({
  initializeKeygenCommands: vi.fn(),
}));

vi.mock("../src/commands/contracts", () => ({
  initializeContractsCommands: vi.fn(),
}));

vi.mock("../src/commands/config", () => ({
  initializeConfigCommands: vi.fn(),
}));

vi.mock("../src/commands/validators", () => ({
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

describe("CLI", () => {
  it("should initialize CLI", () => {
    expect(initializeCLI).not.toThrow();
  });
});
