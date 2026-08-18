import type {Address} from "genlayer-js/types";

/** Minimal client surface: all this helper needs is a native-balance read. */
interface BalanceReader {
  getBalance: (args: {address: Address}) => Promise<bigint>;
}

/**
 * Authoritative "available to stake" for a vesting contract.
 *
 * Vesting.sol enforces every staking path (vestingDelegatorJoin /
 * vestingValidatorJoin / vestingValidatorDeposit) against its LIVE NATIVE
 * BALANCE — each reverts `InsufficientContractBalance` when the amount exceeds
 * `address(this).balance` — and blocks staking entirely once revoked. So the
 * contract's balance IS the cap: it already nets withdrawals, committed
 * principal, and realized rewards/losses, and correctly includes still-locked
 * (unvested) tokens. It must NOT be derived from vested/total/withdrawn/
 * committed arithmetic.
 *
 * @returns 0 when the contract is revoked (staking disabled), otherwise its
 *   on-chain balance.
 */
export async function vestingAvailableToStake(
  client: BalanceReader,
  vestingAddress: Address,
  revoked: boolean,
): Promise<bigint> {
  return revoked ? 0n : client.getBalance({address: vestingAddress});
}
