import { Command } from "commander";
import { SchemaAction } from "../../src/commands/contracts/schema";
import { vi, describe, beforeEach, afterEach, test, expect } from "vitest";
import { initializeContractsCommands } from "../../src/commands/contracts";

vi.mock("../../src/commands/contracts/schema");
vi.mock("esbuild", () => ({
  buildSync: vi.fn(),
}));

describe("schema command", () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    initializeContractsCommands(program);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("SchemaAction.schema is called with default options", async () => {
    program.parse(["node", "test", "schema", "0xMockedContract"]);
    expect(SchemaAction).toHaveBeenCalledTimes(1);
    expect(SchemaAction.prototype.schema).toHaveBeenCalledWith({
      contractAddress: "0xMockedContract",
    });
  });

  test("SchemaAction.schema is called with custom RPC URL", async () => {
    program.parse([
      "node",
      "test",
      "schema",
      "0xMockedContract",
      "--rpc",
      "https://custom-rpc-url.com"
    ]);
    expect(SchemaAction).toHaveBeenCalledTimes(1);
    expect(SchemaAction.prototype.schema).toHaveBeenCalledWith({
      contractAddress: "0xMockedContract",
      rpc: "https://custom-rpc-url.com"
    });
  });

  test("SchemaAction is instantiated when the schema command is executed", async () => {
    program.parse(["node", "test", "schema", "0xMockedContract"]);
    expect(SchemaAction).toHaveBeenCalledTimes(1);
  });

  test("throws error for unrecognized options", async () => {
    const schemaCommand = program.commands.find((cmd) => cmd.name() === "schema");
    schemaCommand?.exitOverride();
    expect(() => program.parse(["node", "test", "schema", "0xMockedContract", "--unknown"]))
      .toThrowError("error: unknown option '--unknown'");
  });

  test("SchemaAction.schema is called without throwing errors for valid options", async () => {
    program.parse(["node", "test", "schema", "0xMockedContract"]);
    vi.mocked(SchemaAction.prototype.schema).mockResolvedValueOnce(undefined);
    expect(() =>
      program.parse(["node", "test", "schema", "0xMockedContract"])
    ).not.toThrow();
  });
}); 