/**
 * Back-compat shim. The staking tx builders now live in the generalized
 * `txBuilders.ts` (shared across staking + vesting). Re-exported here so the
 * PR #367 call sites and tests that import from `stakingTx` keep working.
 */
export {
  buildValidatorJoinTx,
  buildSetIdentityTx,
  extractValidatorWallet,
  type BuiltTx,
  type IdentityFields,
} from "./txBuilders";
