import {describe, test, expect} from "vitest";
import {isDepositPending} from "../../src/commands/staking/epochTiming";

describe("isDepositPending", () => {
  test("epoch-0 deposits are never pending (the contract counts them at once)", () => {
    expect(isDepositPending(0n, 0n)).toBe(false);
    expect(isDepositPending(0n, 1n)).toBe(false);
  });

  test("later deposits are pending for two epochs", () => {
    expect(isDepositPending(5n, 5n)).toBe(true);
    expect(isDepositPending(5n, 6n)).toBe(true);
    expect(isDepositPending(5n, 7n)).toBe(false);
  });
});
