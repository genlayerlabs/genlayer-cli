import {describe, expect, test} from "vitest";
import {parseGas} from "../../src/commands/contracts/transaction";

describe("parseGas", () => {
  test.each([
    ["32000000", 32_000_000n],
    [" 42 ", 42n],
    ["0x5208", 21_000n],
  ])("parses %s", (value, expected) => {
    expect(parseGas(value)).toBe(expected);
  });

  test("omits gas when the option is absent", () => {
    expect(parseGas(undefined)).toBeUndefined();
  });

  test.each(["0", "0x0", "-1", "1.5", "32_000_000", "nope"])(
    "rejects invalid gas %s",
    value => {
      expect(() => parseGas(value)).toThrow("--gas must be a positive integer");
    },
  );
});
