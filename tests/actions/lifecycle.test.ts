import {beforeEach, describe, expect, test, vi} from "vitest";
import {createClient} from "genlayer-js";
import type {TransactionHash} from "genlayer-js/types";
import {LifecycleAction} from "../../src/commands/transactions/lifecycle";

vi.mock("genlayer-js");

describe("LifecycleAction", () => {
  const txId = `0x${"12".repeat(32)}` as TransactionHash;
  const request = vi.fn();
  let action: LifecycleAction;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({request} as any);
    action = new LifecycleAction();
    vi.spyOn(action as any, "getAccount").mockResolvedValue(undefined);
    vi.spyOn(action as any, "startSpinner").mockImplementation(() => {});
    vi.spyOn(action as any, "succeedSpinner").mockImplementation(() => {});
    vi.spyOn(action as any, "failSpinner").mockImplementation(() => {});
  });

  test("reads the raw lifecycle only through the explicit advanced action", async () => {
    const lifecycle = {
      storedStatus: "Proposing",
      projectedStatus: "Undetermined",
      resolutionAction: "MaterializeDecision",
    };
    request.mockResolvedValue(lifecycle);

    await action.lifecycle({txId});

    expect(request).toHaveBeenCalledWith({
      method: "gen_getTransactionLifecycle",
      params: [{txId}],
    });
    expect(action["succeedSpinner"]).toHaveBeenCalledWith("Advanced transaction lifecycle", lifecycle);
  });

  test("passes an optional evaluation timestamp to the lifecycle RPC", async () => {
    request.mockResolvedValue({});

    await action.lifecycle({txId, timestamp: 1_700_000_000});

    expect(request).toHaveBeenCalledWith({
      method: "gen_getTransactionLifecycle",
      params: [{txId, timestamp: 1_700_000_000}],
    });
  });
});
