import {describe, test, expect} from "vitest";
import {encodeFunctionData, encodeEventTopics, encodeAbiParameters, type TransactionReceipt} from "viem";
import {abi} from "genlayer-js";
import {
  buildValidatorJoinTx,
  buildSetIdentityTx,
  extractValidatorWallet,
} from "../../src/lib/wallet/stakingTx";

const STAKING = "0x4A4449E617F8D10FDeD0b461CadEf83939E821A5";
const OPERATOR = "0x1111111111111111111111111111111111111111";
const VALIDATOR_WALLET = "0x2222222222222222222222222222222222222222";

describe("buildValidatorJoinTx", () => {
  test("encodes the no-operator overload (bare validatorJoin())", () => {
    const {to, data} = buildValidatorJoinTx(STAKING);
    const expected = encodeFunctionData({abi: abi.STAKING_ABI, functionName: "validatorJoin"});
    expect(to).toBe(STAKING);
    expect(data).toBe(expected);
  });

  test("encodes the operator overload with the operator arg", () => {
    const {data} = buildValidatorJoinTx(STAKING, OPERATOR);
    const expected = encodeFunctionData({
      abi: abi.STAKING_ABI,
      functionName: "validatorJoin",
      args: [OPERATOR as `0x${string}`],
    });
    expect(data).toBe(expected);
  });

  test("selectors differ between the two overloads", () => {
    const bare = buildValidatorJoinTx(STAKING).data;
    const withOp = buildValidatorJoinTx(STAKING, OPERATOR).data;
    expect(bare.slice(0, 10)).not.toBe(withOp.slice(0, 10));
  });

  test("prefixes a bare (0x-less) staking address", () => {
    const {to} = buildValidatorJoinTx(STAKING.slice(2));
    expect(to).toBe(STAKING);
  });
});

describe("buildSetIdentityTx", () => {
  test("encodes moniker with empty optional fields and 0x extraCid", () => {
    const {to, data} = buildSetIdentityTx(VALIDATOR_WALLET, {moniker: "MyValidator"});
    const expected = encodeFunctionData({
      abi: abi.VALIDATOR_WALLET_ABI,
      functionName: "setIdentity",
      args: ["MyValidator", "", "", "", "", "", "", "", "0x"],
    });
    expect(to).toBe(VALIDATOR_WALLET);
    expect(data).toBe(expected);
  });

  test("hex extraCid is passed through verbatim", () => {
    const {data} = buildSetIdentityTx(VALIDATOR_WALLET, {moniker: "V", extraCid: "0xdeadbeef"});
    expect(data).toBe(
      encodeFunctionData({
        abi: abi.VALIDATOR_WALLET_ABI,
        functionName: "setIdentity",
        args: ["V", "", "", "", "", "", "", "", "0xdeadbeef"],
      }),
    );
  });

  test("non-hex extraCid is UTF-8 hex-encoded", () => {
    const {data} = buildSetIdentityTx(VALIDATOR_WALLET, {moniker: "V", extraCid: "cid"});
    const cidHex = ("0x" + Buffer.from("cid", "utf-8").toString("hex")) as `0x${string}`;
    expect(data).toBe(
      encodeFunctionData({
        abi: abi.VALIDATOR_WALLET_ABI,
        functionName: "setIdentity",
        args: ["V", "", "", "", "", "", "", "", cidHex],
      }),
    );
  });
});

describe("extractValidatorWallet", () => {
  function receiptWithJoinLog(validator: string): TransactionReceipt {
    // ValidatorJoin(operator, validator, amount) — all non-indexed.
    const topics = encodeEventTopics({abi: abi.STAKING_ABI, eventName: "ValidatorJoin"});
    const data = encodeAbiParameters(
      [
        {name: "operator", type: "address"},
        {name: "validator", type: "address"},
        {name: "amount", type: "uint256"},
      ],
      [OPERATOR as `0x${string}`, validator as `0x${string}`, 42000n * 10n ** 18n],
    );
    return {
      transactionHash: "0xabc" as `0x${string}`,
      logs: [{data, topics}],
    } as unknown as TransactionReceipt;
  }

  test("returns the validator wallet address from the ValidatorJoin log", () => {
    const receipt = receiptWithJoinLog(VALIDATOR_WALLET);
    expect(extractValidatorWallet(receipt).toLowerCase()).toBe(VALIDATOR_WALLET.toLowerCase());
  });

  test("ignores unrelated / undecodable logs and finds the join event", () => {
    const receipt = receiptWithJoinLog(VALIDATOR_WALLET);
    (receipt.logs as any).unshift({data: "0x", topics: ["0xdeadbeef"]});
    expect(extractValidatorWallet(receipt).toLowerCase()).toBe(VALIDATOR_WALLET.toLowerCase());
  });

  test("throws a clear error when no ValidatorJoin event is present", () => {
    const receipt = {
      transactionHash: "0xdef" as `0x${string}`,
      logs: [],
    } as unknown as TransactionReceipt;
    expect(() => extractValidatorWallet(receipt)).toThrow(/ValidatorJoin event not found/);
  });
});
