import { Command } from "commander";
import { vi, describe, beforeEach, afterEach, test, expect } from "vitest";
import { initializeContractsCommands } from "../../src/commands/contracts";
import { DeployAction } from "../../src/commands/contracts/deploy";

vi.mock("../../src/commands/contracts/deploy");
vi.mock("esbuild", () => ({
  buildSync: vi.fn(),
}));

describe("deploy command", () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    initializeContractsCommands(program);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("DeployAction.deploy is called with default options", async () => {
    program.parse(["node", "test", "deploy", "--contract", "./path/to/contract"]);
    expect(DeployAction).toHaveBeenCalledTimes(1);
    expect(DeployAction.prototype.deploy).toHaveBeenCalledWith({
      contract: "./path/to/contract",
      args: [],
    });
  });

  test("DeployAction.deploy is called with positional arguments", async () => {
    program.parse([
      "node",
      "test",
      "deploy",
      "--contract",
      "./path/to/contract",
      "--args",
      "1",
      "2",
      "3",
    ]);
    expect(DeployAction).toHaveBeenCalledTimes(1);
    expect(DeployAction.prototype.deploy).toHaveBeenCalledWith({
      contract: "./path/to/contract",
      args: ["1", "2", "3"]
    });
  });

  test("DeployAction is instantiated when the deploy command is executed", async () => {
    program.parse(["node", "test", "deploy", "--contract", "./path/to/contract"]);
    expect(DeployAction).toHaveBeenCalledTimes(1);
  });

  test("throws error for unrecognized options", async () => {
    const deployCommand = program.commands.find((cmd) => cmd.name() === "deploy");
    deployCommand?.exitOverride();
    expect(() => program.parse(["node", "test", "deploy", "--unknown"])).toThrowError(
      "error: unknown option '--unknown'"
    );
  });

  test("DeployAction.deploy is called without throwing errors for valid options", async () => {
    program.parse(["node", "test", "deploy", "--contract", "./path/to/contract"]);
    vi.mocked(DeployAction.prototype.deploy).mockResolvedValueOnce(undefined);
    expect(() =>
      program.parse(["node", "test", "deploy", "--contract", "./path/to/contract"])
    ).not.toThrow();
  });

  test("DeployAction.deployScripts is called without throwing errors", async () => {
    program.parse(["node", "test", "deploy"]);
    vi.mocked(DeployAction.prototype.deployScripts).mockResolvedValueOnce(undefined);
    expect(() =>
      program.parse(["node", "test", "deploy"])
    ).not.toThrow();
  });
});
