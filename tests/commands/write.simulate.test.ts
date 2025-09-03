import {Command} from "commander";
import {vi, describe, beforeEach, afterEach, test, expect} from "vitest";
import {initializeContractsCommands} from "../../src/commands/contracts";
import {WriteAction} from "../../src/commands/contracts/write";
import {SimulateWriteAction} from "../../src/commands/contracts/simulate";
import {getCommand, getCommandOption} from "../utils";

vi.mock("../../src/commands/contracts/write");
vi.mock("../../src/commands/contracts/simulate");
vi.mock("esbuild", () => ({
  buildSync: vi.fn(),
}));

describe("write command simulate routing", () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    initializeContractsCommands(program);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("write command exposes simulate-related options", () => {
    const writeCmd = getCommand(program, "write");
    expect(getCommandOption(writeCmd, "--simulate")).toBeDefined();
    expect(getCommandOption(writeCmd, "--rawReturn")).toBeDefined();
    expect(getCommandOption(writeCmd, "--leaderOnly")).toBeDefined();
    expect(getCommandOption(writeCmd, "--transactionHashVariant")).toBeDefined();
  });

  test("routes to SimulateWriteAction when --simulate is provided and passes flags", async () => {
    program.parse([
      "node",
      "test",
      "write",
      "0xDef",
      "setFlag",
      "--simulate",
      "--rpc",
      "http://localhost:8080",
      "--args",
      "1",
      "false",
      "--rawReturn",
      "--leaderOnly",
      "--transactionHashVariant",
      "legacy",
    ]);

    expect(SimulateWriteAction).toHaveBeenCalledTimes(1);
    expect(SimulateWriteAction.prototype.simulate).toHaveBeenCalledWith({
      contractAddress: "0xDef",
      method: "setFlag",
      args: [1, false],
      rpc: "http://localhost:8080",
      rawReturn: true,
      leaderOnly: true,
      transactionHashVariant: "legacy",
    });
  });

  test("routes to WriteAction when --simulate is not provided", async () => {
    program.parse(["node", "test", "write", "0xAbc", "setValue", "--args", "42", "hello", "true"]);

    expect(WriteAction).toHaveBeenCalledTimes(1);
    expect(WriteAction.prototype.write).toHaveBeenCalledWith({
      contractAddress: "0xAbc",
      method: "setValue",
      args: [42, "hello", true],
      rpc: undefined,
    });
  });
}); 