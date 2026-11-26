import {describe, test, vi, beforeEach, afterEach, expect} from "vitest";
import {VestingValidatorSetIdentityAction} from "../../src/commands/vesting/validatorSetIdentity";

/**
 * BUG: `vesting validator set-identity --extra-cid 0x...` double-encodes hex.
 *
 * src/commands/vesting/validatorSetIdentity.ts L33 (keystore) and L89 (browser):
 *   const extraCid = options.extraCid ? toHex(new TextEncoder().encode(options.extraCid)) : "0x";
 *
 * The flag is documented as "IPFS CID or hex bytes (0x...)" and every other
 * command in the repo passes `extraCid` straight to the SDK, whose
 * `encodeExtraCid` does hex passthrough (`if (extraCid.startsWith("0x")) return
 * extraCid`). The staking counterpart (staking/setIdentity.ts) forwards the raw
 * value for exactly this reason. The vesting command instead UTF-8-encodes the
 * raw string unconditionally, so a hex payload like `0xabcd` is turned into
 * `0x307861626364` (the ASCII bytes of the text "0xabcd") and written on-chain.
 *
 * Fix direction: forward `options.extraCid` to the SDK (or pass through when it
 * starts with "0x") instead of UTF-8 re-encoding.
 *
 * This test FAILS today (the client receives the double-encoded value).
 */

vi.mock("genlayer-js", () => ({
  createClient: vi.fn(),
  createAccount: vi.fn(() => ({address: "0xMockedAddress"})),
  abi: {VESTING_ABI: []},
}));

vi.mock("genlayer-js/chains", () => ({
  localnet: {id: 1, name: "localnet", rpcUrls: {default: {http: ["http://localhost:8545"]}}},
  studionet: {id: 2, name: "studionet", rpcUrls: {default: {http: ["https://studionet.genlayer.com"]}}},
  testnetAsimov: {id: 3, name: "testnet-asimov", rpcUrls: {default: {http: ["https://testnet.genlayer.com"]}}},
  testnetBradbury: {id: 4, name: "testnet-bradbury", rpcUrls: {default: {http: ["https://testnet.genlayer.com"]}}},
}));

describe("BUG: vesting validator set-identity double-encodes --extra-cid hex", () => {
  let action: VestingValidatorSetIdentityAction;
  let client: {vestingValidatorSetIdentity: ReturnType<typeof vi.fn>};

  beforeEach(() => {
    vi.clearAllMocks();
    action = new VestingValidatorSetIdentityAction();
    vi.spyOn(action as any, "startSpinner").mockImplementation(() => {});
    vi.spyOn(action as any, "setSpinnerText").mockImplementation(() => {});
    vi.spyOn(action as any, "succeedSpinner").mockImplementation(() => {});
    vi.spyOn(action as any, "failSpinner").mockImplementation(() => {});
    vi.spyOn(action as any, "log").mockImplementation(() => {});
    // Force the keystore lane.
    vi.spyOn(action as any, "isBrowserWallet").mockReturnValue(false);
    vi.spyOn(action as any, "resolveBeneficiaryVesting").mockResolvedValue("0xVesting");
    client = {
      vestingValidatorSetIdentity: vi
        .fn()
        .mockResolvedValue({transactionHash: "0xTH", blockNumber: 1n, gasUsed: 2n}),
    };
    vi.spyOn(action as any, "getVestingClient").mockResolvedValue(client);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("a 0x-prefixed extra-cid is forwarded verbatim, not UTF-8 re-encoded", async () => {
    await action.execute({
      walletAddress: "0xWallet0000000000000000000000000000000001",
      moniker: "M",
      extraCid: "0xabcd",
    } as any);

    expect(action["failSpinner"]).not.toHaveBeenCalled();
    expect(client.vestingValidatorSetIdentity).toHaveBeenCalledWith(
      expect.objectContaining({extraCid: "0xabcd"}),
    );
  });
});
