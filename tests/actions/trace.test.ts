import {describe, test, vi, beforeEach, afterEach, expect} from "vitest";
import {TraceAction} from "../../src/commands/transactions/trace";
import type {TransactionHash} from "genlayer-js/types";

// TraceAction routes through the typed SDK action client.debugTraceTransaction
// (same wire call as the former raw client.request({method:
// "gen_dbg_traceTransaction"})).
const mockClient = {
  debugTraceTransaction: vi.fn(),
};

function setupActionMocks(action: any) {
  vi.spyOn(action as any, "getClient").mockResolvedValue(mockClient);
  vi.spyOn(action as any, "startSpinner").mockImplementation(() => {});
  vi.spyOn(action as any, "succeedSpinner").mockImplementation(() => {});
  vi.spyOn(action as any, "failSpinner").mockImplementation(() => {});
}

const txId = "0xdeadbeef" as TransactionHash;

describe("TraceAction", () => {
  let action: TraceAction;

  beforeEach(() => {
    vi.clearAllMocks();
    action = new TraceAction();
    setupActionMocks(action);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("fetches the trace via the typed SDK action", async () => {
    const trace = {calls: [], result: "ok"};
    mockClient.debugTraceTransaction.mockResolvedValue(trace);

    await action.trace({txId, round: 2});

    expect(mockClient.debugTraceTransaction).toHaveBeenCalledWith({hash: txId, round: 2});
    expect(action["succeedSpinner"]).toHaveBeenCalledWith("Execution trace retrieved", trace);
  });

  test("defaults round to 0", async () => {
    mockClient.debugTraceTransaction.mockResolvedValue({});

    await action.trace({txId});

    expect(mockClient.debugTraceTransaction).toHaveBeenCalledWith({hash: txId, round: 0});
  });

  test("reports when no trace is found", async () => {
    mockClient.debugTraceTransaction.mockResolvedValue(null);

    await action.trace({txId});

    expect(action["failSpinner"]).toHaveBeenCalledWith(
      "No trace found",
      `No execution trace found for transaction ${txId}`,
    );
  });

  test("handles errors", async () => {
    const err = new Error("trace boom");
    mockClient.debugTraceTransaction.mockRejectedValue(err);

    await action.trace({txId});

    expect(action["failSpinner"]).toHaveBeenCalledWith("Error retrieving execution trace", err);
  });
});
