import {describe, it, expect, beforeAll} from "vitest";
import {createClient, parseStakingAmount, formatStakingAmount} from "genlayer-js";
import {testnetAsimov} from "genlayer-js/chains";
import type {Address} from "genlayer-js/types";

const TIMEOUT = 30_000;

describe("Testnet Asimov - CLI Staking Smoke Tests", () => {
  let client: ReturnType<typeof createClient>;

  beforeAll(() => {
    client = createClient({chain: testnetAsimov});
  });

  it("getEpochInfo returns valid epoch info", async () => {
    const info = await client.getEpochInfo();
    expect(typeof info.currentEpoch).toBe("bigint");
    expect(typeof info.lastFinalizedEpoch).toBe("bigint");
    expect(typeof info.validatorMinStake).toBe("string");
    expect(typeof info.validatorMinStakeRaw).toBe("bigint");
    expect(typeof info.delegatorMinStake).toBe("string");
    expect(typeof info.delegatorMinStakeRaw).toBe("bigint");
    expect(typeof info.activeValidatorsCount).toBe("bigint");
    expect(typeof info.epochMinDuration).toBe("bigint");
    expect(info.currentEpoch >= 0n).toBe(true);
  }, TIMEOUT);

  it("getActiveValidatorsCount returns a bigint", async () => {
    const count = await client.getActiveValidatorsCount();
    expect(typeof count).toBe("bigint");
    expect(count >= 0n).toBe(true);
  }, TIMEOUT);

  it("getActiveValidators returns an array of addresses", async () => {
    const validators = await client.getActiveValidators();
    expect(Array.isArray(validators)).toBe(true);
    for (const v of validators) {
      expect(v).toMatch(/^0x[0-9a-fA-F]{40}$/);
    }
  }, TIMEOUT);

  describe("validator-dependent tests", () => {
    let validator: Address | undefined;

    beforeAll(async () => {
      const validators = await client.getActiveValidators();
      validator = validators[0];
    });

    it("getEpochData returns valid epoch data for current epoch", async () => {
      const info = await client.getEpochInfo();
      const data = await client.getEpochData(info.currentEpoch);
      expect(typeof data.start).toBe("bigint");
      expect(typeof data.end).toBe("bigint");
      expect(typeof data.inflation).toBe("bigint");
      expect(typeof data.weight).toBe("bigint");
      expect(typeof data.vcount).toBe("bigint");
      expect(typeof data.claimed).toBe("bigint");
      expect(typeof data.stakeDeposit).toBe("bigint");
      expect(typeof data.stakeWithdrawal).toBe("bigint");
      expect(typeof data.slashed).toBe("bigint");
    }, TIMEOUT);

    it("isValidator returns boolean for active validator", async () => {
      if (!validator) return;
      const result = await client.isValidator(validator);
      expect(typeof result).toBe("boolean");
      expect(result).toBe(true);
    }, TIMEOUT);

    it("getValidatorInfo returns valid info", async () => {
      if (!validator) return;
      const info = await client.getValidatorInfo(validator);
      expect(info.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(info.owner).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(info.operator).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(typeof info.vStake).toBe("string");
      expect(typeof info.vStakeRaw).toBe("bigint");
      expect(typeof info.vShares).toBe("bigint");
      expect(typeof info.dStake).toBe("string");
      expect(typeof info.dStakeRaw).toBe("bigint");
      expect(typeof info.live).toBe("boolean");
      expect(typeof info.banned).toBe("boolean");
      expect(typeof info.needsPriming).toBe("boolean");
      expect(Array.isArray(info.pendingDeposits)).toBe(true);
      expect(Array.isArray(info.pendingWithdrawals)).toBe(true);
    }, TIMEOUT);

    it("getStakeInfo returns self-stake info", async () => {
      if (!validator) return;
      const info = await client.getStakeInfo(validator, validator);
      expect(info.delegator).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(info.validator).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(typeof info.shares).toBe("bigint");
      expect(typeof info.stake).toBe("string");
      expect(typeof info.stakeRaw).toBe("bigint");
      expect(Array.isArray(info.pendingDeposits)).toBe(true);
      expect(Array.isArray(info.pendingWithdrawals)).toBe(true);
    }, TIMEOUT);
  });

  it("getQuarantinedValidators returns an array", async () => {
    const result = await (client as any).getQuarantinedValidators();
    expect(Array.isArray(result)).toBe(true);
    for (const v of result) {
      expect(v).toMatch(/^0x[0-9a-fA-F]{40}$/);
    }
  }, TIMEOUT);

  it("getBannedValidators returns an array of banned validator info", async () => {
    const result = await (client as any).getBannedValidators();
    expect(Array.isArray(result)).toBe(true);
    for (const v of result) {
      expect(v.validator).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(typeof v.untilEpoch).toBe("bigint");
      expect(typeof v.permanentlyBanned).toBe("boolean");
    }
  }, TIMEOUT);

  it("parseStakingAmount and formatStakingAmount round-trip", () => {
    const parsed = parseStakingAmount("1.5gen");
    expect(typeof parsed).toBe("bigint");
    expect(parsed > 0n).toBe(true);

    const formatted = formatStakingAmount(parsed);
    expect(typeof formatted).toBe("string");
    expect(formatted).toContain("1.5");
  });
});
