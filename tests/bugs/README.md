# Bug reproduction tests (intentionally failing)

These test files reproduce real bugs found in the `v0.40-dev` line by a bug hunt.
**They are expected to FAIL against the current code** — each one pins the
correct behavior so the fix can be verified by making the test go green. A
follow-up change should fix the underlying bug in `src/` (not weaken the test).

Every file has a header comment with the exact source location, root cause, a
concrete reproduction, and the suggested fix direction.

| Test file | Source | Bug (instability / wrong result) |
|---|---|---|
| `contractArgParsing.test.ts` | `src/commands/contracts/index.ts` | `--args` parsing: `parseScalar("1.5")` throws an uncaught `SyntaxError` (crash); an empty-string arg becomes the number `0`; odd-length `b#` hex silently drops the last nibble; a JSON arg containing a float silently degrades to a raw string (structure lost). |
| `browserSendLabelLeak.test.ts` | `src/lib/wallet/browserSend.ts` | `nextLabel` is cleared only after a successful send, so a rejected/failed transaction leaks its signing label onto the next, unrelated transaction (user sees the wrong prompt). |
| `browserBridgeConnectedValidation.test.ts` | `src/lib/wallet/browserBridge.ts` | `POST /api/connected` accepts an empty/malformed body and marks the bridge `connected` with an empty-string address; `getState()` then reports `connected: true` while every write path rejects as "not connected". |
| `stakingNetworkSingletonMutation.test.ts` | `src/commands/staking/StakingAction.ts` (+ `src/lib/actions/BaseAction.ts` `resolveNetwork`) | Using `--staking-address` without `--network` mutates the shared, module-level chain singleton, leaking the staking address into every later network resolution in the process. |
| `vestingSetIdentityExtraCid.test.ts` | `src/commands/vesting/validatorSetIdentity.ts` | `vesting validator set-identity --extra-cid 0x...` UTF-8 re-encodes the value instead of hex passthrough (as staking does), writing corrupted identity bytes on-chain. |
| `validatorExitReportsFailureOnSuccess.test.ts` | `src/commands/staking/validatorExit.ts` | A confirmed on-chain exit is reported as "Failed to exit" (non-zero exit, tx hash discarded) when the purely-cosmetic post-exit `getEpochInfo()` read transiently fails. |

Run just these: `npx vitest run tests/bugs`
