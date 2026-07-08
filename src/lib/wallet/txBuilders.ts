import {encodeFunctionData, decodeEventLog, toHex, type Abi, type TransactionReceipt} from "viem";
import {abi} from "genlayer-js";
import type {Address} from "genlayer-js/types";

/**
 * Pure transaction-building / event-decoding helpers for the browser-wallet
 * signing path (Lane A: staking + vesting). These expose only the calldata so
 * the CLI can hand `{to, data}` to a browser wallet that signs-and-broadcasts
 * (eth_sendTransaction) instead of the SDK's sign-then-sendRawTransaction path
 * (which MetaMask cannot satisfy).
 *
 * Dependency-free and side-effect-free so they are trivially unit-testable.
 */

export interface BuiltTx {
  to: Address;
  data: `0x${string}`;
}

function normalizeAddress(address: string): Address {
  return (address.startsWith("0x") ? address : `0x${address}`) as Address;
}

/**
 * Generic calldata builder: `encodeFunctionData` against any ABI + a target.
 * Per-command usage is a one-liner; avoids bespoke builders per function.
 */
export function buildTx(abiDef: Abi, to: string, functionName: string, args?: unknown[]): BuiltTx {
  const data = encodeFunctionData(
    args && args.length > 0 ? {abi: abiDef, functionName, args} : {abi: abiDef, functionName},
  );
  return {to: normalizeAddress(to), data};
}

/**
 * Encode an `extraCid` identity field to bytes hex. `0x`-prefixed input passes
 * through; anything else is UTF-8 encoded; empty/undefined → "0x". Mirrors the
 * genlayer-js encoding used by setIdentity / vestingValidatorSetIdentity.
 */
export function encodeExtraCid(extraCid?: string): `0x${string}` {
  if (!extraCid) return "0x";
  return extraCid.startsWith("0x") ? (extraCid as `0x${string}`) : toHex(new TextEncoder().encode(extraCid));
}

/**
 * Build the calldata for `validatorJoin`. Two payable overloads exist:
 * `validatorJoin(address _operator)` and `validatorJoin()`. Stake is msg.value
 * (carried separately as the tx `value`, not encoded here).
 */
export function buildValidatorJoinTx(stakingAddress: string, operator?: string): BuiltTx {
  return buildTx(
    abi.STAKING_ABI as unknown as Abi,
    stakingAddress,
    "validatorJoin",
    operator ? [operator as Address] : undefined,
  );
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
  return buildTx(abi.VALIDATOR_WALLET_ABI as unknown as Abi, validatorWallet, "setIdentity", [
    identity.moniker,
    identity.logoUri || "",
    identity.website || "",
    identity.description || "",
    identity.email || "",
    identity.twitter || "",
    identity.telegram || "",
    identity.github || "",
    encodeExtraCid(identity.extraCid),
  ]);
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
