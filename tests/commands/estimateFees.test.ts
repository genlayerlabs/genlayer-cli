import {Command} from "commander";
import {vi, describe, beforeEach, afterEach, test, expect} from "vitest";
import {initializeContractsCommands} from "../../src/commands/contracts";
import {EstimateFeesAction} from "../../src/commands/contracts/estimateFees";

vi.mock("../../src/commands/contracts/estimateFees");
vi.mock("esbuild", () => ({
  buildSync: vi.fn(),
}));

describe("estimate-fees command", () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    initializeContractsCommands(program);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("EstimateFeesAction.estimate is called with static estimate options", async () => {
    const fees = '{"distribution":{"totalMessageFees":"3"}}';
    program.parse([
      "node",
      "test",
      "estimate-fees",
      "--fees",
      fees,
      "--rpc",
      "http://127.0.0.1:4000/api",
    ]);

    expect(EstimateFeesAction).toHaveBeenCalledTimes(1);
    expect(EstimateFeesAction.prototype.estimate).toHaveBeenCalledWith({
      args: [],
      fees,
      rpc: "http://127.0.0.1:4000/api",
      contractAddress: undefined,
      method: undefined,
    });
  });

  test("EstimateFeesAction.estimate is called with simulation target and args", async () => {
    program.parse([
      "node",
      "test",
      "estimate-fees",
      "0x0000000000000000000000000000000000000001",
      "update",
      "--args",
      "after",
      "2",
    ]);

    expect(EstimateFeesAction.prototype.estimate).toHaveBeenCalledWith({
      args: ["after", 2],
      contractAddress: "0x0000000000000000000000000000000000000001",
      method: "update",
    });
  });

  test("EstimateFeesAction.estimate receives json output flag", async () => {
    program.parse([
      "node",
      "test",
      "estimate-fees",
      "--json",
    ]);

    expect(EstimateFeesAction.prototype.estimate).toHaveBeenCalledWith({
      args: [],
      contractAddress: undefined,
      json: true,
      method: undefined,
    });
  });

  test("EstimateFeesAction.estimate receives include-report flag", async () => {
    program.parse([
      "node",
      "test",
      "estimate-fees",
      "0x0000000000000000000000000000000000000001",
      "update",
      "--include-report",
    ]);

    expect(EstimateFeesAction.prototype.estimate).toHaveBeenCalledWith({
      args: [],
      contractAddress: "0x0000000000000000000000000000000000000001",
      includeReport: true,
      method: "update",
    });
  });
});
