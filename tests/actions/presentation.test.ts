import {describe, expect, test} from "vitest";
import {presentTransaction, withoutAdvancedLifecycle} from "../../src/commands/transactions/presentation";

describe("transaction presentation", () => {
  test.each([
    [{lifecycle: {state: "processing", phase: "appeal_revealing"}}, "Processing · Appeal Revealing"],
    [{lifecycle: {state: "decided", outcome: "undetermined"}}, "Decided · Undetermined"],
    [{lifecycle: {state: "finalized", outcome: "accepted"}}, "Finalized · Accepted"],
    [{lifecycle: {state: "canceled"}}, "Canceled"],
  ])("formats the SDK simple lifecycle %#", (transaction, expected) => {
    expect(presentTransaction(transaction as any).label).toBe(expected);
  });

  test("prefers stored status over projected status on the train fallback", () => {
    expect(
      presentTransaction({
        storedStatusName: "PROPOSING",
        statusName: "UNDETERMINED",
        resolutionActionName: "MATERIALIZE_DECISION",
      } as any).label,
    ).toBe("Processing · Proposal");
  });

  test("removes raw lifecycle internals from ordinary receipt output", () => {
    expect(
      withoutAdvancedLifecycle({
        hash: "0x01",
        status: "UNDETERMINED",
        storedStatusName: "PROPOSING",
        resolutionActionName: "MATERIALIZE_DECISION",
        canFinalize: false,
      } as any),
    ).toEqual({hash: "0x01"});
  });
});
