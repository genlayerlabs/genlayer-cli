import {describe, test, expect, vi} from "vitest";
import {vestingAvailableToStake} from "../../src/lib/vesting/availableToStake";
import type {Address} from "genlayer-js/types";

const VESTING: Address = "0xVesting000000000000000000000000000000001" as Address;

describe("vestingAvailableToStake", () => {
  test("revoked contract → returns 0n and never reads the balance", async () => {
    const getBalance = vi.fn();
    const client = {getBalance};

    const result = await vestingAvailableToStake(client, VESTING, true);

    expect(result).toBe(0n);
    // Revoked staking is disabled outright — no RPC read should happen.
    expect(getBalance).not.toHaveBeenCalled();
  });

  test("not revoked → returns the on-chain balance, read against the vesting address", async () => {
    const getBalance = vi.fn().mockResolvedValue(12345678901234567890n);
    const client = {getBalance};

    const result = await vestingAvailableToStake(client, VESTING, false);

    expect(result).toBe(12345678901234567890n);
    expect(getBalance).toHaveBeenCalledTimes(1);
    expect(getBalance).toHaveBeenCalledWith({address: VESTING});
  });

  test("not revoked, zero balance → returns 0n (still consulted the chain)", async () => {
    const getBalance = vi.fn().mockResolvedValue(0n);
    const client = {getBalance};

    const result = await vestingAvailableToStake(client, VESTING, false);

    expect(result).toBe(0n);
    expect(getBalance).toHaveBeenCalledWith({address: VESTING});
  });

  test("not revoked → a failing balance read propagates (no silent 0)", async () => {
    const boom = new Error("rpc down");
    const getBalance = vi.fn().mockRejectedValue(boom);
    const client = {getBalance};

    await expect(vestingAvailableToStake(client, VESTING, false)).rejects.toThrow("rpc down");
  });
});
