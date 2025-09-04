import { Command } from "commander";
import { CodeAction } from "../../src/commands/contracts/code";
import { vi, describe, beforeEach, afterEach, test, expect } from "vitest";
import { initializeContractsCommands } from "../../src/commands/contracts";

vi.mock("../../src/commands/contracts/code");
vi.mock("esbuild", () => ({
  buildSync: vi.fn(),
}));

describe("code command", () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    initializeContractsCommands(program);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("CodeAction.code is called with default options", async () => {
    program.parse(["node", "test", "code", "0xMockedContract"]);
    expect(CodeAction).toHaveBeenCalledTimes(1);
    expect(CodeAction.prototype.code).toHaveBeenCalledWith({
      contractAddress: "0xMockedContract",
    });
  });

  test("CodeAction.code is called with custom RPC URL", async () => {
    program.parse([
      "node",
      "test",
      "code",
      "0xMockedContract",
      "--rpc",
      "https://custom-rpc-url.com"
    ]);
    expect(CodeAction).toHaveBeenCalledTimes(1);
    expect(CodeAction.prototype.code).toHaveBeenCalledWith({
      contractAddress: "0xMockedContract",
      rpc: "https://custom-rpc-url.com"
    });
  });

  test("CodeAction is instantiated when the code command is executed", async () => {
    program.parse(["node", "test", "code", "0xMockedContract"]);
    expect(CodeAction).toHaveBeenCalledTimes(1);
  });

  test("throws error for unrecognized options", async () => {
    const codeCommand = program.commands.find((cmd) => cmd.name() === "code");
    codeCommand?.exitOverride();
    expect(() => program.parse(["node", "test", "code", "0xMockedContract", "--unknown"]))
      .toThrowError("error: unknown option '--unknown'");
  });

  test("CodeAction.code is called without throwing errors for valid options", async () => {
    program.parse(["node", "test", "code", "0xMockedContract"]);
    vi.mocked(CodeAction.prototype.code).mockResolvedValueOnce(undefined as any);
    expect(() =>
      program.parse(["node", "test", "code", "0xMockedContract"])
    ).not.toThrow();
  });
});


