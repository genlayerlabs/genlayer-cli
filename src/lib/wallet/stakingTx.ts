import {encodeFunctionData, decodeEventLog, toHex, type TransactionReceipt} from "viem";
import {abi} from "genlayer-js";
import type {Address} from "genlayer-js/types";

/**
 * Pure transaction-building / event-decoding helpers for the browser-wallet
 * signing path. These mirror the encode/decode logic in genlayer-js
 * `src/staking/actions.ts` (validatorJoin ~217-251, setIdentity ~330-360) but
 * expose only the calldata so the CLI can hand `{to, data}` to a browser wallet
 * that signs-and-broadcasts (eth_sendTransaction) instead of the SDK's
 * sign-then-sendRawTransaction path (which MetaMask cannot satisfy).
 *
 * Kept dependency-free and side-effect-free so they are trivially unit-testable.
 */

export interface BuiltTx {
  to: Address;
  data: `0x${string}`;
}

/**
 * Build the calldata for `validatorJoin`. Two payable overloads exist:
 * `validatorJoin(address _operator)` and `validatorJoin()`. Stake is msg.value
 * (carried separately as the tx `value`, not encoded here).
 */
export function buildValidatorJoinTx(stakingAddress: string, operator?: string): BuiltTx {
  const data = operator
    ? encodeFunctionData({
        abi: abi.STAKING_ABI,
        functionName: "validatorJoin",
        args: [operator as Address],
      })
    : encodeFunctionData({
        abi: abi.STAKING_ABI,
        functionName: "validatorJoin",
      });

  return {to: normalizeAddress(stakingAddress), data};
}

export interface IdentityFields {
  moniker: string;
  logoUri?: string;
  website?: string;
  description?: string;
  email?: string;
  twitter?: string;
  telegram?: string;
  github?: string;
  extraCid?: string;
}

/**
 * Build the calldata for `setIdentity` on a ValidatorWallet contract.
 * `to` is the validator wallet address (not the staking contract).
 */
export function buildSetIdentityTx(validatorWallet: string, identity: IdentityFields): BuiltTx {
  let extraCidBytes: `0x${string}` = "0x";
  if (identity.extraCid) {
    extraCidBytes = identity.extraCid.startsWith("0x")
      ? (identity.extraCid as `0x${string}`)
      : toHex(new TextEncoder().encode(identity.extraCid));
  }

  const data = encodeFunctionData({
    abi: abi.VALIDATOR_WALLET_ABI,
    functionName: "setIdentity",
    args: [
      identity.moniker,
      identity.logoUri || "",
      identity.website || "",
      identity.description || "",
      identity.email || "",
      identity.twitter || "",
      identity.telegram || "",
      identity.github || "",
      extraCidBytes,
    ],
  });

  return {to: normalizeAddress(validatorWallet), data};
}

/**
 * Decode the `ValidatorJoin` event from a receipt's logs and return the new
 * ValidatorWallet contract address. Throws with the same "event not found"
 * style as genlayer-js if no matching log is present.
 */
export function extractValidatorWallet(receipt: TransactionReceipt): Address {
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: abi.STAKING_ABI,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "ValidatorJoin") {
        return (decoded.args as unknown as {validator: Address}).validator;
      }
    } catch {
      // Not a ValidatorJoin event - keep searching.
    }
  }

  throw new Error(
    `ValidatorJoin event not found in transaction ${receipt.transactionHash}. ` +
      `Transaction succeeded but validator wallet address could not be determined.`,
  );
}

function normalizeAddress(address: string): Address {
  return (address.startsWith("0x") ? address : `0x${address}`) as Address;
}
