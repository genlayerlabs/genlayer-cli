/**
 * Epoch timing rules shared by the staking read commands.
 *
 * After epoch 0, a deposit becomes active ACTIVATION_DELAY_EPOCHS after the
 * epoch it was made in, and a withdrawal is claimable UNBONDING_PERIOD_EPOCHS
 * after its exit epoch.
 *
 * Epoch 0 is different: the Staking contract writes epoch-0 deposits straight
 * into the active stake record (ValidatorUtils.validatorDepositEpoch0 /
 * DelegatorUtils.delegatorJoinEpoch0), so they are already counted in vStake /
 * stake and must never be reported as pending.
 */
export const ACTIVATION_DELAY_EPOCHS = 2n;
export const UNBONDING_PERIOD_EPOCHS = 7n;

/** True when a deposit made in `depositEpoch` is not active yet. */
export function isDepositPending(depositEpoch: bigint, currentEpoch: bigint): boolean {
  if (depositEpoch === 0n) return false;
  return depositEpoch + ACTIVATION_DELAY_EPOCHS > currentEpoch;
}
