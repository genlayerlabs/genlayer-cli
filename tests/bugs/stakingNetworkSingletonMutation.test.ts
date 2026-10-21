import {describe, test, vi, beforeEach, afterEach, expect} from "vitest";
import {StakingInfoAction} from "../../src/commands/staking/stakingInfo";
import {resolveNetwork} from "../../src/lib/actions/BaseAction";

/**
 * BUG: StakingAction mutates the shared, module-level network singleton when
 * `--staking-address` is used without `--network`.
 *
 * src/lib/actions/BaseAction.ts resolveNetwork() returns the SHARED
 * BUILT_IN_NETWORKS[...] / localnet objects (no clone). StakingAction.getNetwork
 * only defensively copies on the `--network` flag branch:
 *
 *   if (config.network) return {...resolveNetwork(config.network, ...)}; // copy
 *   return resolveNetwork(this.getConfig().network, ...);               // SHARED
 *
 * getReadOnlyStakingClient / getStakingClient / getBrowserStakingClient then do
 * `network.stakingContract = {address: config.stakingAddress, ...}`, writing
 * through to the shared chain object. Every later resolveNetwork() in the same
 * process (a second action, the wizard's multiple clients, the whole test
 * suite) inherits the leaked staking address.
 *
 * Fix direction: clone on the config-fallback branch too (or clone inside
 * resolveNetwork), so per-command overrides never touch the singleton.
 *
 * This test FAILS today: after one read-only client build with a custom
 * staking address and no network, the shared localnet singleton carries that
 * address.
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

const CUSTOM_STAKING_ADDRESS = "0xC0ffee0000000000000000000000000000000001";

describe("BUG: staking mutates the shared network singleton", () => {
  let action: StakingInfoAction;

  beforeEach(() => {
    vi.clearAllMocks();
    action = new StakingInfoAction();
    // Deterministic: no configured network → resolveNetwork(undefined) => localnet singleton.
    vi.spyOn(action as any, "getConfig").mockReturnValue({});
    vi.spyOn(action as any, "getCustomNetworks").mockReturnValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("--staking-address without --network must not mutate the localnet singleton", async () => {
    // Sanity: the singleton has no staking address to begin with.
    expect((resolveNetwork(undefined) as any).stakingContract?.address).toBeUndefined();

    // Build a read-only client with a custom staking address and NO network flag.
    try {
      await (action as any).getReadOnlyStakingClient({stakingAddress: CUSTOM_STAKING_ADDRESS});
    } catch {
      // The client build isn't what we're testing; the mutation happens first.
    }

    // The shared singleton must be untouched.
    expect((resolveNetwork(undefined) as any).stakingContract?.address).not.toBe(CUSTOM_STAKING_ADDRESS);
  });
});
