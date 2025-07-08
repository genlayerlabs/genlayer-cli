import {Command} from "commander";
import {WriteAction} from "../../src/commands/contracts/write";
import {vi, describe, beforeEach, afterEach, test, expect} from "vitest";
import {initializeContractsCommands} from "../../src/commands/contracts";

vi.mock("../../src/commands/contracts/write");
vi.mock("esbuild", () => ({
  buildSync: vi.fn(),
}));

describe("write command", () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    initializeContractsCommands(program);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("WriteAction.write is called with default options", async () => {
    program.parse(["node", "test", "write", "0xMockedContract", "setData"]);
    expect(WriteAction).toHaveBeenCalledTimes(1);
    expect(WriteAction.prototype.write).toHaveBeenCalledWith({
      contractAddress: "0xMockedContract",
      method: "setData",
      args: [],
    });
  });

  test("WriteAction.write is called with positional arguments and options", async () => {
    program.parse([
      "node",
      "test",
      "write",
      "0xMockedContract",
      "updateCounter",
      "--args",
      "100",
      "someString",
      "true",
      "--rpc",
      "https://custom-rpc-url-for-write.com",
    ]);
    expect(WriteAction).toHaveBeenCalledTimes(1);
    expect(WriteAction.prototype.write).toHaveBeenCalledWith({
      contractAddress: "0xMockedContract",
      method: "updateCounter",
      args: [100, "someString", true],
      rpc: "https://custom-rpc-url-for-write.com",
    });
  });

  test("WriteAction is instantiated when the write command is executed", async () => {
    program.parse(["node", "test", "write", "0xMockedContract", "anotherMethod"]);
    expect(WriteAction).toHaveBeenCalledTimes(1);
  });

  test("throws error for unrecognized options", async () => {
    const writeCommand = program.commands.find(cmd => cmd.name() === "write");
    writeCommand?.exitOverride();
    expect(() =>
      program.parse(["node", "test", "write", "0xMockedContract", "someMethod", "--invalid-option"]),
    ).toThrowError("error: unknown option '--invalid-option'");
  });

  test("WriteAction.write is called without throwing errors for valid options", async () => {
    program.parse(["node", "test", "write", "0xMockedContract", "validMethod"]);
    vi.mocked(WriteAction.prototype.write).mockResolvedValueOnce(undefined);
    // Need to parse again inside expect to ensure the mockResolvedValueOnce is used for the assertion context
    expect(() => program.parse(["node", "test", "write", "0xMockedContract", "validMethod"])).not.toThrow();
  });
});
