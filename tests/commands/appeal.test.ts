import {Command} from "commander";
import {AppealAction} from "../../src/commands/transactions/appeal";
import {vi, describe, beforeEach, afterEach, test, expect} from "vitest";
import {initializeTransactionsCommands} from "../../src/commands/transactions";

vi.mock("../../src/commands/transactions/appeal");

describe("appeal command", () => {
  let program: Command;
  const mockTxId = "0x1234567890123456789012345678901234567890123456789012345678901234";

  beforeEach(() => {
    program = new Command();
    initializeTransactionsCommands(program);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("AppealAction.appeal is called with default options", async () => {
    program.parse(["node", "test", "appeal", mockTxId]);
    expect(AppealAction).toHaveBeenCalledTimes(1);
    expect(AppealAction.prototype.appeal).toHaveBeenCalledWith({
      txId: mockTxId,
    });
  });

  test("AppealAction.appeal is called with custom RPC URL", async () => {
    program.parse([
      "node",
      "test",
      "appeal",
      mockTxId,
      "--rpc",
      "https://custom-rpc-url-for-appeal.com",
    ]);
    expect(AppealAction).toHaveBeenCalledTimes(1);
    expect(AppealAction.prototype.appeal).toHaveBeenCalledWith({
      txId: mockTxId,
      rpc: "https://custom-rpc-url-for-appeal.com",
    });
  });

  test("AppealAction is instantiated when the appeal command is executed", async () => {
    program.parse(["node", "test", "appeal", mockTxId]);
    expect(AppealAction).toHaveBeenCalledTimes(1);
  });

  test("throws error for unrecognized options", async () => {
    const appealCommand = program.commands.find(cmd => cmd.name() === "appeal");
    appealCommand?.exitOverride();
    expect(() =>
      program.parse(["node", "test", "appeal", mockTxId, "--invalid-option"]),
    ).toThrowError("error: unknown option '--invalid-option'");
  });
}); 