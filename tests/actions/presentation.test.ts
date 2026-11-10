import {describe, expect, test} from "vitest";
import {presentTransaction, withoutAdvancedLifecycle} from "../../src/commands/transactions/presentation";

describe("transaction presentation", () => {
  test.each([
    [{lifecycle: {state: "processing", phase: "appeal-revealing"}}, "Processing · Appeal Revealing"],
    [{lifecycle: {state: "decided", outcome: "undetermined"}}, "Decided · Undetermined"],
    [{lifecycle: {state: "finalized", outcome: "accepted"}}, "Finalized · Accepted"],
    [{lifecycle: {state: "canceled"}}, "Canceled"],
  ])("formats the SDK simple lifecycle %#", (transaction, expected) => {
    expect(presentTransaction(transaction as any).label).toBe(expected);
  });

  test("removes protocol lifecycle details from ordinary receipt output", () => {
    expect(
      withoutAdvancedLifecycle({
        hash: "0x01",
        status: "UNDETERMINED",
        statusName: "UNDETERMINED",
        lifecycle: {state: "decided", outcome: "undetermined"},
      } as any),
    ).toEqual({hash: "0x01"});
  });
});
