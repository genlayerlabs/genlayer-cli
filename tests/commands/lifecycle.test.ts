import {afterEach, beforeEach, describe, expect, test, vi} from "vitest";
import {Command} from "commander";
import {LifecycleAction} from "../../src/commands/transactions/lifecycle";
import {initializeTransactionsCommands} from "../../src/commands/transactions";

vi.mock("../../src/commands/transactions/lifecycle");

describe("lifecycle command", () => {
  const txId = `0x${"34".repeat(32)}`;
  let program: Command;

  beforeEach(() => {
    program = new Command();
    initializeTransactionsCommands(program);
    vi.clearAllMocks();
  });

  afterEach(() => vi.restoreAllMocks());

  test("routes the explicit debug command to the raw lifecycle RPC action", () => {
    program.parse([
      "node",
      "test",
      "lifecycle",
      txId,
      "--rpc",
      "https://rpc.example",
      "--timestamp",
      "1700000000",
    ]);

    expect(LifecycleAction.prototype.lifecycle).toHaveBeenCalledWith({
      txId,
      rpc: "https://rpc.example",
      timestamp: 1_700_000_000,
    });
  });

  test("groups lifecycle and manual finalization as advanced recovery commands", () => {
    for (const name of ["lifecycle", "finalize", "finalize-batch"]) {
      expect(program.commands.find(command => command.name() === name)?.helpGroup()).toBe(
        "Advanced and recovery",
      );
    }
  });
});
