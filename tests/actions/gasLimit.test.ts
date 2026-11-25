import {describe, test, expect} from "vitest";
import {parseGasLimit, withGasLimitHint} from "../../src/commands/contracts/fees";

describe("parseGasLimit", () => {
  test("is absent without the flag", () => {
    expect(parseGasLimit(undefined)).toBeUndefined();
  });

  test.each([
    ["500000", 500_000n],
    [" 21000 ", 21_000n],
    ["0x7a120", 500_000n],
  ])("parses %j", (value, expected) => {
    expect(parseGasLimit(value)).toBe(expected);
  });

  test.each(["0", "0x0", "-1", "1.5", "1e6", "500k", "", "none"])("rejects %j", value => {
    expect(() => parseGasLimit(value)).toThrow("--gas-limit must be a positive integer.");
  });
});

describe("withGasLimitHint", () => {
  test("points a would-revert error at --gas-limit and keeps the original as cause", () => {
    const original = new Error("Transaction would revert: TooFewValidatorsForAdmission(0, 5)");
    const hinted = withGasLimitHint(original) as Error;

    expect(hinted.message).toBe(
      "Transaction would revert: TooFewValidatorsForAdmission(0, 5). To send it anyway, pass --gas-limit <n>; " +
        "it will likely be mined as a revert and still cost gas.",
    );
    expect(hinted.cause).toBe(original);
  });

  test.each([new Error("fetch failed"), "would revert", undefined])("leaves %j unchanged", error => {
    expect(withGasLimitHint(error)).toBe(error);
  });
});
