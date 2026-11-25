import {describe, test, expect} from "vitest";
import {DEFAULT_MAX_FEE, assertFeeWithinMax, resolveMaxFee} from "../../src/commands/contracts/fees";

const GEN = 10n ** 18n;

describe("resolveMaxFee", () => {
  test("defaults to 10 GEN when neither the flag nor the config sets it", () => {
    expect(DEFAULT_MAX_FEE).toBe(10n * GEN);
    expect(resolveMaxFee(undefined, undefined)).toBe(DEFAULT_MAX_FEE);
    expect(resolveMaxFee(undefined, null)).toBe(DEFAULT_MAX_FEE);
  });

  test.each([
    ["5gen", 5n * GEN],
    ["0.5GEN", GEN / 2n],
    ["2eth", 2n * GEN],
    ["123", 123n],
    ["0", 0n],
    [" 7gen ", 7n * GEN],
  ])("parses %j", (value, expected) => {
    expect(resolveMaxFee(value, undefined)).toBe(expected);
  });

  test.each(["none", "NONE", "None"])("reads %j as no limit", value => {
    expect(resolveMaxFee(value, undefined)).toBeNull();
    expect(resolveMaxFee(undefined, value)).toBeNull();
  });

  test("uses the config value when the flag is absent and lets the flag override it", () => {
    expect(resolveMaxFee(undefined, "2gen")).toBe(2n * GEN);
    expect(resolveMaxFee("3gen", "2gen")).toBe(3n * GEN);
    expect(resolveMaxFee("5gen", "none")).toBe(5n * GEN);
    expect(resolveMaxFee("none", "2gen")).toBeNull();
  });

  test.each(["off", "-", "inf", "unlimited", "-1", "1.5", "", "10 gen gen", "0x10"])(
    "rejects %j from the flag",
    value => {
      expect(() => resolveMaxFee(value, undefined)).toThrow(/--max-fee must be an amount.*"none"/);
    },
  );

  test("rejects an invalid config value instead of ignoring the guard", () => {
    expect(() => resolveMaxFee(undefined, "off")).toThrow(/config maxFee must be an amount.*"none"/);
  });
});

describe("assertFeeWithinMax", () => {
  test("accepts a deposit at or below the cap and any deposit without a cap", () => {
    expect(() => assertFeeWithinMax(10n, 10n)).not.toThrow();
    expect(() => assertFeeWithinMax(10n ** 30n, null)).not.toThrow();
  });

  test("rejects a deposit above the cap and names how to raise it", () => {
    expect(() => assertFeeWithinMax(12n * GEN + GEN / 2n, 10n * GEN)).toThrow(
      /Fee deposit 12\.5 GEN exceeds the 10 GEN maximum.*--max-fee <amount>.*--max-fee none/,
    );
  });
});
