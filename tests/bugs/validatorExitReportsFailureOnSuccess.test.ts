import {describe, test, vi, beforeEach, afterEach, expect} from "vitest";
import {ValidatorExitAction} from "../../src/commands/staking/validatorExit";

/**
 * BUG: a SUCCESSFUL validator exit is reported as "Failed to exit" when the
 * post-exit informational epoch read transiently fails.
 *
 * src/commands/staking/validatorExit.ts (~L44-66):
 *   const result = await client.validatorExit({validator, shares}); // tx CONFIRMED on-chain
 *   const epochInfo = await client.getEpochInfo();                  // cosmetic read, SAME try
 *   ...
 *   this.succeedSpinner("Exit initiated successfully!", output);
 *   } catch (error) { this.failSpinner("Failed to exit", ...); }
 *
 * `getEpochInfo()` is only used to pick a human-readable note, but it runs in
 * the same try block AFTER the exit transaction has already been mined. A
 * transient RPC hiccup on that read lands in the catch, so the CLI prints
 * "Failed to exit" and exits non-zero — discarding the real tx hash — for an
 * exit that actually succeeded. (validatorJoin.preflight deliberately swallows
 * getEpochInfo failures for exactly this reason.)
 *
 * Fix direction: move the getEpochInfo read out of the critical try, or
 * swallow its failure and still report success with the tx hash.
 *
 * This test FAILS today (failSpinner is called for a confirmed exit).
 */

vi.mock("genlayer-js", () => ({
  createClient: vi.fn(() => ({})),
  createAccount: vi.fn(() => ({address: "0xMockedAddress"})),
  formatStakingAmount: vi.fn((v: bigint) => `${v}`),
  parseStakingAmount: vi.fn((v: string) => BigInt(v)),
  abi: {STAKING_ABI: [], VALIDATOR_WALLET_ABI: []},
}));

vi.mock("genlayer-js/chains", () => ({
  localnet: {id: 1, name: "localnet", rpcUrls: {default: {http: ["http://localhost:8545"]}}},
  studionet: {id: 2, name: "studionet", rpcUrls: {default: {http: ["https://studionet.genlayer.com"]}}},
  testnetAsimov: {id: 3, name: "testnet-asimov", rpcUrls: {default: {http: ["https://testnet.genlayer.com"]}}},
  testnetBradbury: {id: 4, name: "testnet-bradbury", rpcUrls: {default: {http: ["https://testnet.genlayer.com"]}}},
}));

describe("BUG: validator-exit reports failure when the cosmetic epoch read fails", () => {
  let action: ValidatorExitAction;
  let client: {validatorExit: ReturnType<typeof vi.fn>; getEpochInfo: ReturnType<typeof vi.fn>};

  beforeEach(() => {
    vi.clearAllMocks();
    action = new ValidatorExitAction();
    vi.spyOn(action as any, "isBrowserWallet").mockReturnValue(false);
    vi.spyOn(action as any, "startSpinner").mockImplementation(() => {});
    vi.spyOn(action as any, "setSpinnerText").mockImplementation(() => {});
    vi.spyOn(action as any, "succeedSpinner").mockImplementation(() => {});
    vi.spyOn(action as any, "failSpinner").mockImplementation(() => {});
    client = {
      // Exit tx is confirmed on-chain.
      validatorExit: vi.fn().mockResolvedValue({
        transactionHash: "0xExitHash",
        blockNumber: 10n,
        gasUsed: 21000n,
      }),
      // The purely-informational epoch read hiccups.
      getEpochInfo: vi.fn().mockRejectedValue(new Error("RPC timeout")),
    };
    vi.spyOn(action as any, "getStakingClient").mockResolvedValue(client);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("a confirmed exit is reported as success, not 'Failed to exit'", async () => {
    await action.execute({
      validator: "0xValidatorWallet00000000000000000000000001",
      shares: "100",
    } as any);

    expect(client.validatorExit).toHaveBeenCalled();
    // The exit succeeded on-chain — the user must not be told it failed.
    expect(action["failSpinner"]).not.toHaveBeenCalledWith("Failed to exit", expect.anything());
    expect(action["succeedSpinner"]).toHaveBeenCalled();
  });
});
