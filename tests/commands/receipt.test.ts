import {Command} from "commander";
import {ReceiptAction} from "../../src/commands/transactions/receipt";
import {vi, describe, beforeEach, afterEach, test, expect} from "vitest";
import {initializeTransactionsCommands} from "../../src/commands/transactions";

vi.mock("../../src/commands/transactions/receipt");

describe("receipt command", () => {
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

  test("ReceiptAction.receipt is called with default options", async () => {
    program.parse(["node", "test", "receipt", mockTxId]);
    expect(ReceiptAction).toHaveBeenCalledTimes(1);
    expect(ReceiptAction.prototype.receipt).toHaveBeenCalledWith({
      txId: mockTxId,
      status: "FINALIZED",
      retries: 100,
      interval: 5000,
    });
  });

  test("ReceiptAction.receipt is called with custom options", async () => {
    program.parse([
      "node",
      "test",
      "receipt",
      mockTxId,
      "--status",
      "ACCEPTED",
      "--retries",
      "50",
      "--interval",
      "3000",
      "--rpc",
      "https://custom-rpc-url-for-receipt.com",
    ]);
    expect(ReceiptAction).toHaveBeenCalledTimes(1);
    expect(ReceiptAction.prototype.receipt).toHaveBeenCalledWith({
      txId: mockTxId,
      status: "ACCEPTED",
      retries: 50,
      interval: 3000,
      rpc: "https://custom-rpc-url-for-receipt.com",
    });
  });

  test("ReceiptAction is instantiated when the receipt command is executed", async () => {
    program.parse(["node", "test", "receipt", mockTxId]);
    expect(ReceiptAction).toHaveBeenCalledTimes(1);
  });

  test("throws error for unrecognized options", async () => {
    const receiptCommand = program.commands.find(cmd => cmd.name() === "receipt");
    receiptCommand?.exitOverride();
    expect(() =>
      program.parse(["node", "test", "receipt", mockTxId, "--invalid-option"]),
    ).toThrowError("error: unknown option '--invalid-option'");
  });

  test("parses numeric options correctly", async () => {
    program.parse([
      "node",
      "test",
      "receipt",
      mockTxId,
      "--retries",
      "25",
      "--interval",
      "1000",
    ]);
    expect(ReceiptAction.prototype.receipt).toHaveBeenCalledWith({
      txId: mockTxId,
      status: "FINALIZED",
      retries: 25,
      interval: 1000,
    });
  });

  test("uses fallback value for invalid numeric options", async () => {
    program.parse([
      "node",
      "test",
      "receipt", 
      mockTxId,
      "--retries",
      "invalid",
      "--interval", 
      "notanumber",
    ]);
    expect(ReceiptAction.prototype.receipt).toHaveBeenCalledWith({
      txId: mockTxId,
      status: "FINALIZED",
      retries: 100,
      interval: 5000,
    });
  });
}); 