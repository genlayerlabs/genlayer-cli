import {vi, describe, test, expect} from "vitest";

// contracts/index.ts transitively imports deploy.ts (esbuild). Mock it so the
// module loads in the jsdom test environment, exactly as parseArg.test.ts does.
vi.mock("esbuild", () => ({
  buildSync: vi.fn(),
}));

import {parseArg, parseScalar} from "../../src/commands/contracts";

/**
 * BUGS in src/commands/contracts/index.ts argument parsing (parseScalar /
 * parseArg / coerceValue). These are pure functions reached by every
 * `--args` value on deploy / call / write, so a wrong result here is sent
 * straight to the contract.
 */

describe("BUG: parseScalar crashes on a non-integer numeric arg", () => {
  // parseScalar (~L56-57): a numeric-looking string that isn't a safe integer
  // falls through to `BigInt(value)`, and BigInt("1.5") throws a SyntaxError.
  // There is no try/catch and no global handler, so `genlayer deploy --args 1.5`
  // dies with a raw stack trace instead of a friendly message.
  test('parseScalar("1.5") must not throw', () => {
    expect(() => parseScalar("1.5")).not.toThrow();
  });

  test('parseScalar("-0.5") must not throw', () => {
    expect(() => parseScalar("-0.5")).not.toThrow();
  });
});

describe("BUG: an empty-string arg is coerced to the number 0", () => {
  // parseScalar (~L56): Number("") === 0 (not NaN) and 0 is a safe integer,
  // so an intentionally-empty string argument becomes integer 0 on-chain.
  test('parseScalar("") stays an empty string', () => {
    expect(parseScalar("")).toBe("");
  });

  test('parseScalar(" ") is not silently turned into 0', () => {
    expect(parseScalar(" ")).not.toBe(0);
  });
});

describe("BUG: odd-length b# hex bytes silently drop the last nibble", () => {
  // BYTES_PREFIX_RE allows an odd number of hex chars and hexToBytes does
  // `new Uint8Array(hex.length / 2)`, truncating 1.5 -> 1. "b#abc" loses the
  // trailing "c" with no error — a corrupted byte payload sent silently.
  test('parseScalar("b#abc") must reject odd-length hex instead of truncating', () => {
    expect(() => parseScalar("b#abc")).toThrow();
  });
});

describe("BUG: a JSON arg containing a float degrades to a literal string", () => {
  // parseArg: coerceValue runs inside the JSON.parse try block; BigInt(1.5)
  // throws (RangeError) and is swallowed by the `catch`, so the whole JSON
  // argument silently degrades to parseScalar('[1.5]') -> the raw string
  // "[1.5]". The structured list/object the user passed is lost.
  test('parseArg("[1.5]") preserves the array structure (not the raw string)', () => {
    const result = parseArg("[1.5]");
    expect(result[0]).not.toBe("[1.5]");
    expect(Array.isArray(result[0])).toBe(true);
  });

  test('parseArg with a float field keeps an object, not a string', () => {
    const result = parseArg('{"price":1.5}');
    expect(typeof result[0]).not.toBe("string");
  });
});
