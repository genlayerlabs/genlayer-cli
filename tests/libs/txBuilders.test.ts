import {describe, test, expect} from "vitest";
import {encodeFunctionData, type Abi} from "viem";
import {abi} from "genlayer-js";
import {buildTx, encodeExtraCid} from "../../src/lib/wallet/txBuilders";

const VALIDATOR_WALLET = "0x2222222222222222222222222222222222222222";
const VESTING = "0x3333333333333333333333333333333333333333";
const OPERATOR = "0x1111111111111111111111111111111111111111";
const VALIDATOR = "0x4444444444444444444444444444444444444444";

describe("buildTx (generic calldata builder)", () => {
  test("prefixes a bare (0x-less) address", () => {
    const {to} = buildTx(
      abi.VALIDATOR_WALLET_ABI as unknown as Abi,
      VALIDATOR_WALLET.slice(2),
      "validatorClaim",
    );
    expect(to).toBe(VALIDATOR_WALLET);
  });

  test("no-arg call matches encodeFunctionData without args", () => {
    const {data} = buildTx(abi.VALIDATOR_WALLET_ABI as unknown as Abi, VALIDATOR_WALLET, "validatorDeposit");
    expect(data).toBe(encodeFunctionData({abi: abi.VALIDATOR_WALLET_ABI, functionName: "validatorDeposit"}));
  });

  // --- Validator-wallet family ---
  test("setOperator(address) encodes against VALIDATOR_WALLET_ABI", () => {
    const {to, data} = buildTx(abi.VALIDATOR_WALLET_ABI as unknown as Abi, VALIDATOR_WALLET, "setOperator", [
      OPERATOR,
    ]);
    expect(to).toBe(VALIDATOR_WALLET);
    expect(data).toBe(
      encodeFunctionData({
        abi: abi.VALIDATOR_WALLET_ABI,
        functionName: "setOperator",
        args: [OPERATOR as `0x${string}`],
      }),
    );
  });

  test("validatorExit(uint256) encodes shares arg", () => {
    const {data} = buildTx(abi.VALIDATOR_WALLET_ABI as unknown as Abi, VALIDATOR_WALLET, "validatorExit", [
      100n,
    ]);
    expect(data).toBe(
      encodeFunctionData({abi: abi.VALIDATOR_WALLET_ABI, functionName: "validatorExit", args: [100n]}),
    );
  });

  // --- Staking-diamond family ---
  test("delegatorClaim(delegator, validator) preserves ARG ORDER (delegator first)", () => {
    const delegator = "0x5555555555555555555555555555555555555555";
    const {data} = buildTx(abi.STAKING_ABI as unknown as Abi, VESTING, "delegatorClaim", [
      delegator,
      VALIDATOR,
    ]);
    expect(data).toBe(
      encodeFunctionData({
        abi: abi.STAKING_ABI,
        functionName: "delegatorClaim",
        args: [delegator as `0x${string}`, VALIDATOR as `0x${string}`],
      }),
    );
  });

  test("delegatorExit(validator, shares) arg order", () => {
    const {data} = buildTx(abi.STAKING_ABI as unknown as Abi, VESTING, "delegatorExit", [VALIDATOR, 7n]);
    expect(data).toBe(
      encodeFunctionData({
        abi: abi.STAKING_ABI,
        functionName: "delegatorExit",
        args: [VALIDATOR as `0x${string}`, 7n],
      }),
    );
  });

  // --- Vesting family ---
  test("vestingDelegatorJoin(validator, amount) encodes against VESTING_ABI", () => {
    const {to, data} = buildTx(abi.VESTING_ABI as unknown as Abi, VESTING, "vestingDelegatorJoin", [
      VALIDATOR,
      42n * 10n ** 18n,
    ]);
    expect(to).toBe(VESTING);
    expect(data).toBe(
      encodeFunctionData({
        abi: abi.VESTING_ABI,
        functionName: "vestingDelegatorJoin",
        args: [VALIDATOR as `0x${string}`, 42n * 10n ** 18n],
      }),
    );
  });

  test("vestingWithdraw(amount) encodes a single uint arg", () => {
    const {data} = buildTx(abi.VESTING_ABI as unknown as Abi, VESTING, "vestingWithdraw", [5n]);
    expect(data).toBe(
      encodeFunctionData({abi: abi.VESTING_ABI, functionName: "vestingWithdraw", args: [5n]}),
    );
  });

  test("vestingValidatorSetIdentity encodes 10 ordered args incl. extraCid hex + utf8", () => {
    const utf8Cid = encodeExtraCid("cid");
    const {data} = buildTx(abi.VESTING_ABI as unknown as Abi, VESTING, "vestingValidatorSetIdentity", [
      VALIDATOR_WALLET,
      "Moniker",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      utf8Cid,
    ]);
    expect(data).toBe(
      encodeFunctionData({
        abi: abi.VESTING_ABI,
        functionName: "vestingValidatorSetIdentity",
        args: [VALIDATOR_WALLET as `0x${string}`, "Moniker", "", "", "", "", "", "", "", utf8Cid],
      }),
    );

    const hexCid = encodeExtraCid("0xdeadbeef");
    const {data: hexData} = buildTx(
      abi.VESTING_ABI as unknown as Abi,
      VESTING,
      "vestingValidatorSetIdentity",
      [VALIDATOR_WALLET, "V", "", "", "", "", "", "", "", hexCid],
    );
    expect(hexData).toBe(
      encodeFunctionData({
        abi: abi.VESTING_ABI,
        functionName: "vestingValidatorSetIdentity",
        args: [VALIDATOR_WALLET as `0x${string}`, "V", "", "", "", "", "", "", "", "0xdeadbeef"],
      }),
    );
  });
});

describe("encodeExtraCid", () => {
  test("undefined / empty → 0x", () => {
    expect(encodeExtraCid()).toBe("0x");
    expect(encodeExtraCid("")).toBe("0x");
  });

  test("0x-prefixed passes through verbatim", () => {
    expect(encodeExtraCid("0xdeadbeef")).toBe("0xdeadbeef");
  });

  test("non-hex string is UTF-8 hex-encoded", () => {
    expect(encodeExtraCid("cid")).toBe(("0x" + Buffer.from("cid", "utf-8").toString("hex")) as `0x${string}`);
  });
});
