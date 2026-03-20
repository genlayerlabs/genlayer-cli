import {vi, describe, test, expect} from "vitest";
import {CalldataAddress} from "genlayer-js/types";
import {parseArg, parseScalar, coerceValue} from "../../src/commands/contracts";

vi.mock("esbuild", () => ({
  buildSync: vi.fn(),
}));

describe("parseScalar", () => {
  test("parses booleans", () => {
    expect(parseScalar("true")).toBe(true);
    expect(parseScalar("false")).toBe(false);
  });

  test("parses null", () => {
    expect(parseScalar("null")).toBeNull();
  });

  test("parses small integers as Number", () => {
    expect(parseScalar("42")).toBe(42);
    expect(parseScalar("0")).toBe(0);
    expect(parseScalar("-1")).toBe(-1);
  });

  test("parses 0x address as CalldataAddress", () => {
    const result = parseScalar("0x6857Ed54CbafaA74Fc0357145eC0ee1536ca45A0");
    expect(result).toBeInstanceOf(CalldataAddress);
    const addr = result as CalldataAddress;
    expect(addr.bytes).toHaveLength(20);
    expect(addr.bytes[0]).toBe(0x68);
    expect(addr.bytes[19]).toBe(0xa0);
  });

  test("parses addr# prefix as CalldataAddress", () => {
    const result = parseScalar("addr#6857Ed54CbafaA74Fc0357145eC0ee1536ca45A0");
    expect(result).toBeInstanceOf(CalldataAddress);
    const addr = result as CalldataAddress;
    expect(addr.bytes).toHaveLength(20);
    expect(addr.bytes[0]).toBe(0x68);
  });

  test("parses b# prefix as Uint8Array", () => {
    const result = parseScalar("b#deadbeef");
    expect(result).toBeInstanceOf(Uint8Array);
    const bytes = result as Uint8Array;
    expect(bytes).toEqual(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
  });

  test("parses empty b# as empty Uint8Array", () => {
    const result = parseScalar("b#");
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result).toEqual(new Uint8Array([]));
  });

  test("parses non-address hex as BigInt", () => {
    expect(parseScalar("0x1234")).toBe(BigInt("0x1234"));
  });

  test("parses large decimal as BigInt", () => {
    const big = "99999999999999999999";
    expect(parseScalar(big)).toBe(BigInt(big));
  });

  test("parses plain strings", () => {
    expect(parseScalar("hello")).toBe("hello");
    expect(parseScalar("someString")).toBe("someString");
  });

  test("does not treat invalid hex as address", () => {
    const invalid = "0xZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ";
    expect(parseScalar(invalid)).toBe(invalid);
  });
});

describe("coerceValue", () => {
  test("coerces null", () => {
    expect(coerceValue(null)).toBeNull();
  });

  test("coerces booleans", () => {
    expect(coerceValue(true)).toBe(true);
    expect(coerceValue(false)).toBe(false);
  });

  test("coerces safe integers", () => {
    expect(coerceValue(42)).toBe(42);
  });

  test("coerces arrays recursively", () => {
    expect(coerceValue([1, "hello", null])).toEqual([1, "hello", null]);
  });

  test("coerces objects recursively", () => {
    expect(coerceValue({key: "value", n: 42})).toEqual({key: "value", n: 42});
  });

  test("coerces address strings inside objects", () => {
    const result = coerceValue({recipient: "0x6857Ed54CbafaA74Fc0357145eC0ee1536ca45A0"}) as any;
    expect(result.recipient).toBeInstanceOf(CalldataAddress);
  });

  test("coerces address strings inside arrays", () => {
    const result = coerceValue(["0x6857Ed54CbafaA74Fc0357145eC0ee1536ca45A0"]) as any[];
    expect(result[0]).toBeInstanceOf(CalldataAddress);
  });
});

describe("parseArg", () => {
  test("parses scalars", () => {
    expect(parseArg("42")).toEqual([42]);
    expect(parseArg("true")).toEqual([true]);
    expect(parseArg("hello")).toEqual(["hello"]);
  });

  test("parses null", () => {
    expect(parseArg("null")).toEqual([null]);
  });

  test("parses JSON array", () => {
    const result = parseArg('[1, 2, "three"]');
    expect(result).toEqual([[1, 2, "three"]]);
  });

  test("parses JSON object", () => {
    const result = parseArg('{"key": "value", "n": 42}');
    expect(result).toEqual([{key: "value", n: 42}]);
  });

  test("parses nested JSON with address strings", () => {
    const result = parseArg('{"to": "0x6857Ed54CbafaA74Fc0357145eC0ee1536ca45A0", "amount": 100}');
    expect(result).toHaveLength(1);
    const obj = result[0] as any;
    expect(obj.to).toBeInstanceOf(CalldataAddress);
    expect(obj.amount).toBe(100);
  });

  test("parses 0x address as CalldataAddress", () => {
    const result = parseArg("0x6857Ed54CbafaA74Fc0357145eC0ee1536ca45A0");
    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(CalldataAddress);
  });

  test("accumulates with previous args", () => {
    const result = parseArg("42", ["existing"]);
    expect(result).toEqual(["existing", 42]);
  });

  test("treats invalid JSON as plain string", () => {
    expect(parseArg("{not json}")).toEqual(["{not json}"]);
  });

  test("quoted string stays as string with quotes", () => {
    // '"hello"' has literal quote chars — treated as a plain string, not JSON-unwrapped
    expect(parseArg('"hello"')).toEqual(['"hello"']);
  });
});
