import {Command} from "commander";
import {FinalizeAction} from "../../src/commands/transactions/finalize";
import {vi, describe, beforeEach, afterEach, test, expect} from "vitest";
import {initializeTransactionsCommands} from "../../src/commands/transactions";

vi.mock("../../src/commands/transactions/finalize");

describe("finalize command", () => {
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

  test("FinalizeAction.finalize is called with txId", async () => {
    program.parse(["node", "test", "finalize", mockTxId]);
    expect(FinalizeAction).toHaveBeenCalledTimes(1);
    expect(FinalizeAction.prototype.finalize).toHaveBeenCalledWith({txId: mockTxId});
  });

  test("FinalizeAction.finalize is called with custom RPC URL", async () => {
    program.parse(["node", "test", "finalize", mockTxId, "--rpc", "https://custom.com"]);
    expect(FinalizeAction.prototype.finalize).toHaveBeenCalledWith({
      txId: mockTxId,
      rpc: "https://custom.com",
    });
  });

  test("throws error for unrecognized options", async () => {
    const finalizeCommand = program.commands.find(cmd => cmd.name() === "finalize");
    finalizeCommand?.exitOverride();
    expect(() =>
      program.parse(["node", "test", "finalize", mockTxId, "--invalid-option"]),
    ).toThrowError("error: unknown option '--invalid-option'");
  });
});

describe("finalize-batch command", () => {
  let program: Command;
  const mockTxId1 = "0x1111111111111111111111111111111111111111111111111111111111111111";
  const mockTxId2 = "0x2222222222222222222222222222222222222222222222222222222222222222";

  beforeEach(() => {
    program = new Command();
    initializeTransactionsCommands(program);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("FinalizeAction.finalizeBatch is called with a single txId", async () => {
    program.parse(["node", "test", "finalize-batch", mockTxId1]);
    expect(FinalizeAction.prototype.finalizeBatch).toHaveBeenCalledWith({
      txIds: [mockTxId1],
    });
  });

  test("FinalizeAction.finalizeBatch is called with multiple txIds", async () => {
    program.parse(["node", "test", "finalize-batch", mockTxId1, mockTxId2]);
    expect(FinalizeAction.prototype.finalizeBatch).toHaveBeenCalledWith({
      txIds: [mockTxId1, mockTxId2],
    });
  });

  test("FinalizeAction.finalizeBatch is called with custom RPC", async () => {
    program.parse([
      "node", "test", "finalize-batch", mockTxId1, mockTxId2, "--rpc", "https://custom.com",
    ]);
    expect(FinalizeAction.prototype.finalizeBatch).toHaveBeenCalledWith({
      txIds: [mockTxId1, mockTxId2],
      rpc: "https://custom.com",
    });
  });
});
