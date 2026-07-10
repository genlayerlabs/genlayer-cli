import {describe, test, vi, beforeEach, afterEach, expect} from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {createClient} from "genlayer-js";
import {testnetBradbury} from "genlayer-js/chains";
import {BalancesAction} from "../../src/commands/balances/BalancesAction";

// Keep genlayer-js real except createClient (no network I/O). The read-only
// vesting client is stubbed per-test, so createClient is never actually hit.
vi.mock("genlayer-js", async importOriginal => {
  const actual = await importOriginal<typeof import("genlayer-js")>();
  return {...actual, createClient: vi.fn()};
});

const WEI = 10n ** 18n;

// Only the fields BalancesAction reads matter; the client is mocked so the
// shape isn't type-checked at runtime.
function makeState(overrides: Record<string, any> = {}) {
  return {
    name: "Team grant",
    totalAmountRaw: 100n * WEI,
    vestedAmountRaw: 20n * WEI,
    unvestedAmountRaw: 80n * WEI,
    withdrawableAmountRaw: 18n * WEI,
    totalWithdrawnRaw: 2n * WEI,
    revoked: false,
    ...overrides,
  };
}

function makeClient(overrides: Record<string, any> = {}) {
  return {
    getBalance: vi.fn().mockResolvedValue(7n * WEI),
    getBeneficiaryVestings: vi.fn().mockResolvedValue([]),
    getVestingState: vi.fn(),
    getValidatorWallets: vi.fn().mockResolvedValue([]),
    validatorDeposited: vi.fn().mockResolvedValue(0n),
    getActiveValidators: vi.fn().mockResolvedValue([]),
    getQuarantinedValidatorsDetailed: vi.fn().mockResolvedValue([]),
    getBannedValidators: vi.fn().mockResolvedValue([]),
    vestingDepositedPerValidator: vi.fn().mockResolvedValue(0n),
    ...overrides,
  };
}

describe("BalancesAction", () => {
  let tempHome: string;
  let action: BalancesAction;
  let failSpy: any;
  let renderSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    // Own hermetic home so real config/keystore reads stay isolated per test.
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "gl-cli-balances-"));
    vi.spyOn(os, "homedir").mockReturnValue(tempHome);
    vi.mocked(createClient).mockReturnValue({} as any);

    action = new BalancesAction();

    vi.spyOn(action as any, "startSpinner").mockImplementation(() => {});
    vi.spyOn(action as any, "setSpinnerText").mockImplementation(() => {});
    vi.spyOn(action as any, "stopSpinner").mockImplementation(() => {});
    vi.spyOn(action as any, "succeedSpinner").mockImplementation(() => {});
    failSpy = vi.spyOn(action as any, "failSpinner").mockImplementation(() => {});
    // Capture the composed summary instead of asserting brittle console output.
    renderSpy = vi.spyOn(action as any, "renderSummary").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tempHome, {recursive: true, force: true});
  });

  function stub(client: any) {
    vi.spyOn(action as any, "getReadOnlyVestingClient").mockResolvedValue(client);
  }

  test("(a) address with no vesting contracts → wallet-only summary", async () => {
    const client = makeClient({getBeneficiaryVestings: vi.fn().mockResolvedValue([])});
    stub(client);
    vi.spyOn(action as any, "getSignerAddress").mockResolvedValue("0xBen");

    await action.execute({});

    expect(failSpy).not.toHaveBeenCalled();
    const summary = renderSpy.mock.calls[0][0];
    expect(summary.address).toBe("0xBen");
    expect(summary.walletBalanceRaw).toBe(7n * WEI);
    expect(summary.vestings).toEqual([]);
    // No vesting → never touches vesting state / validator enumeration.
    expect(client.getVestingState).not.toHaveBeenCalled();
    expect(client.getActiveValidators).not.toHaveBeenCalled();
  });

  test("(a') studio network (no staking contract): validator scan skipped, wallet + vesting still reported", async () => {
    // studionet carries no staking contract, so the SDK's validator reads
    // throw. `balances` must degrade — skip the scan (delegated principal 0),
    // never fail — and still report wallet + vesting holdings.
    const client = makeClient({
      getBeneficiaryVestings: vi.fn().mockResolvedValue(["0xV1"]),
      getVestingState: vi.fn().mockResolvedValue(makeState()),
      getValidatorWallets: vi.fn().mockResolvedValue(["0xW1"]),
      validatorDeposited: vi.fn().mockResolvedValue(5n * WEI), // self-stake still computed
      // Any staking read would throw on studio; assert we never call them.
      getActiveValidators: vi.fn().mockRejectedValue(new Error("Staking is not supported on studio-based networks")),
      getQuarantinedValidatorsDetailed: vi
        .fn()
        .mockRejectedValue(new Error("Staking is not supported on studio-based networks")),
      getBannedValidators: vi.fn().mockRejectedValue(new Error("Staking is not supported on studio-based networks")),
      getBalance: vi.fn(async ({address}: {address: string}) => (address === "0xV1" ? 30n * WEI : 7n * WEI)),
    });
    stub(client);
    vi.spyOn(action as any, "getSignerAddress").mockResolvedValue("0xBen");

    await action.execute({network: "studionet"});

    expect(failSpy).not.toHaveBeenCalled();
    expect(client.getActiveValidators).not.toHaveBeenCalled();
    expect(client.getQuarantinedValidatorsDetailed).not.toHaveBeenCalled();
    expect(client.getBannedValidators).not.toHaveBeenCalled();
    expect(client.vestingDepositedPerValidator).not.toHaveBeenCalled();
    const summary = renderSpy.mock.calls[0][0];
    expect(summary.walletBalanceRaw).toBe(7n * WEI);
    expect(summary.vestings).toHaveLength(1);
    const v = summary.vestings[0];
    expect(v.selfStakeRaw).toBe(5n * WEI); // self-stake from vesting reads, still shown
    expect(v.delegatedRaw).toBe(0n); // no validator set ⇒ no delegated principal
    expect(v.committedRaw).toBe(5n * WEI);
    expect(v.availableToStakeRaw).toBe(30n * WEI);
  });

  test("(b) one vesting: committed principal computed; available is the contract balance", async () => {
    const client = makeClient({
      getBeneficiaryVestings: vi.fn().mockResolvedValue(["0xV1"]),
      getVestingState: vi.fn().mockResolvedValue(makeState()),
      getValidatorWallets: vi.fn().mockResolvedValue(["0xW1"]),
      validatorDeposited: vi.fn().mockResolvedValue(5n * WEI), // self-stake principal 5
      getActiveValidators: vi.fn().mockResolvedValue(["0xVal1"]),
      vestingDepositedPerValidator: vi.fn().mockResolvedValue(4n * WEI), // delegated principal 4
      // Wallet reads 7; the vesting contract's live on-chain balance is 30.
      getBalance: vi.fn(async ({address}: {address: string}) => (address === "0xV1" ? 30n * WEI : 7n * WEI)),
    });
    stub(client);
    vi.spyOn(action as any, "getSignerAddress").mockResolvedValue("0xBen");

    // testnet-bradbury carries a staking contract, so the validator-set scan
    // runs (localnet/studionet have none — see the studio-degradation test).
    await action.execute({network: "testnet-bradbury"});

    expect(failSpy).not.toHaveBeenCalled();
    const summary = renderSpy.mock.calls[0][0];
    expect(summary.vestings).toHaveLength(1);
    const v = summary.vestings[0];
    expect(v.selfStakeRaw).toBe(5n * WEI);
    expect(v.delegatedRaw).toBe(4n * WEI);
    expect(v.committedRaw).toBe(9n * WEI);
    // available = the vesting contract's live balance, NOT vested−withdrawn−committed.
    expect(v.availableToStakeRaw).toBe(30n * WEI);
    expect(v.revoked).toBe(false);
    // Delegated principal getter takes (vesting, validator); self takes (vesting, wallet).
    expect(client.vestingDepositedPerValidator).toHaveBeenCalledWith("0xV1", "0xVal1");
    expect(client.validatorDeposited).toHaveBeenCalledWith("0xV1", "0xW1");
    expect(client.getBalance).toHaveBeenCalledWith({address: "0xV1"});
  });

  test("(b') revoked vesting → available is 0 even though the contract still holds a balance", async () => {
    const client = makeClient({
      getBeneficiaryVestings: vi.fn().mockResolvedValue(["0xV1"]),
      getVestingState: vi.fn().mockResolvedValue(makeState({revoked: true})),
      getValidatorWallets: vi.fn().mockResolvedValue(["0xW1"]),
      validatorDeposited: vi.fn().mockResolvedValue(10n * WEI), // still-committed principal
      getActiveValidators: vi.fn().mockResolvedValue([]),
      // Non-zero balance, but staking is disabled post-revoke ⇒ available must be 0.
      getBalance: vi.fn().mockResolvedValue(50n * WEI),
    });
    stub(client);
    vi.spyOn(action as any, "getSignerAddress").mockResolvedValue("0xBen");

    await action.execute({});

    const v = renderSpy.mock.calls[0][0].vestings[0];
    expect(v.revoked).toBe(true);
    expect(v.committedRaw).toBe(10n * WEI); // committed breakdown still shown
    expect(v.availableToStakeRaw).toBe(0n); // revoked ⇒ 0, not the 50 balance
  });

  test("(c) multiple vesting contracts each summarized; validator set fetched once", async () => {
    const stateA = makeState({name: "A"});
    const stateB = makeState({name: "B"});
    const client = makeClient({
      getBeneficiaryVestings: vi.fn().mockResolvedValue(["0xVA", "0xVB"]),
      getVestingState: vi.fn().mockImplementation((addr: string) => (addr === "0xVA" ? stateA : stateB)),
      getValidatorWallets: vi.fn().mockResolvedValue([]),
      getActiveValidators: vi.fn().mockResolvedValue([]),
      // Each contract's available-to-stake is its own live on-chain balance.
      getBalance: vi.fn(async ({address}: {address: string}) =>
        (({"0xVA": 20n * WEI, "0xVB": 45n * WEI}) as Record<string, bigint>)[address] ?? 7n * WEI,
      ),
    });
    stub(client);
    vi.spyOn(action as any, "getSignerAddress").mockResolvedValue("0xBen");

    await action.execute({network: "testnet-bradbury"});

    const summary = renderSpy.mock.calls[0][0];
    expect(summary.vestings).toHaveLength(2);
    expect(summary.vestings[0].name).toBe("A");
    expect(summary.vestings[0].availableToStakeRaw).toBe(20n * WEI); // balance of 0xVA
    expect(summary.vestings[1].name).toBe("B");
    expect(summary.vestings[1].availableToStakeRaw).toBe(45n * WEI); // balance of 0xVB
    // Active validator set is global: fetched once and reused across vestings.
    expect(client.getActiveValidators).toHaveBeenCalledTimes(1);
  });

  test("(c') committed-delegation scan unions active + quarantined + banned validators", async () => {
    // A vesting can hold committed principal against validators that left the
    // active set. The scan must union all three lists (de-duped) so committed —
    // and hence available-to-stake — is not under-counted.
    const client = makeClient({
      getBeneficiaryVestings: vi.fn().mockResolvedValue(["0xV1"]),
      getVestingState: vi.fn().mockResolvedValue(makeState()),
      getValidatorWallets: vi.fn().mockResolvedValue([]),
      getActiveValidators: vi.fn().mockResolvedValue(["0xActive"]),
      getQuarantinedValidatorsDetailed: vi
        .fn()
        .mockResolvedValue([{validator: "0xQuar", untilEpoch: 5n, permanentlyBanned: false}]),
      getBannedValidators: vi
        .fn()
        // "0xActive" also appears here to prove de-duplication (case-insensitive).
        .mockResolvedValue([
          {validator: "0xBanned", untilEpoch: 9n, permanentlyBanned: true},
          {validator: "0xactive", untilEpoch: 0n, permanentlyBanned: false},
        ]),
      // 1 GEN committed against every scanned validator.
      vestingDepositedPerValidator: vi.fn().mockResolvedValue(1n * WEI),
      getBalance: vi.fn().mockResolvedValue(7n * WEI),
    });
    stub(client);
    vi.spyOn(action as any, "getSignerAddress").mockResolvedValue("0xBen");

    await action.execute({network: "testnet-bradbury"});

    expect(failSpy).not.toHaveBeenCalled();
    // Active + quarantined + banned, with the duplicate "0xActive"/"0xactive"
    // collapsed → 3 distinct validators scanned for delegated principal.
    const scanned = client.vestingDepositedPerValidator.mock.calls.map((c: any[]) => c[1].toLowerCase());
    expect(new Set(scanned)).toEqual(new Set(["0xactive", "0xquar", "0xbanned"]));
    const v = renderSpy.mock.calls[0][0].vestings[0];
    expect(v.delegatedRaw).toBe(3n * WEI); // 3 distinct validators × 1 GEN
  });

  test("(d) custom active network shows alias + chainId, not the base chain name", async () => {
    action.writeConfig("customNetworks", {
      myclarke: {base: "testnet-bradbury", overrides: {chainId: 4221, rpcUrl: "http://localhost:9999"}},
    });
    action.writeConfig("network", "myclarke");

    const client = makeClient({getBeneficiaryVestings: vi.fn().mockResolvedValue([])});
    stub(client);
    vi.spyOn(action as any, "getSignerAddress").mockResolvedValue("0xBen");

    await action.execute({});

    expect(failSpy).not.toHaveBeenCalled();
    const summary = renderSpy.mock.calls[0][0];
    expect(summary.network).toBe("myclarke");
    expect(summary.chainId).toBe(4221);
    // The naive bug would print chain.name, which for a custom net is its base's name.
    expect(summary.network).not.toBe(testnetBradbury.name);
  });

  test("(e) --beneficiary override needs no account (getSignerAddress not called)", async () => {
    const client = makeClient({getBeneficiaryVestings: vi.fn().mockResolvedValue([])});
    stub(client);
    // If the code fell back to the keystore it would reject here.
    const signerSpy = vi
      .spyOn(action as any, "getSignerAddress")
      .mockRejectedValue(new Error("Account 'default' not found."));

    await action.execute({beneficiary: "0xExplicit"});

    expect(failSpy).not.toHaveBeenCalled();
    const summary = renderSpy.mock.calls[0][0];
    expect(summary.address).toBe("0xExplicit");
    expect(client.getBeneficiaryVestings).toHaveBeenCalledWith("0xExplicit", undefined);
    expect(client.getBalance).toHaveBeenCalledWith({address: "0xExplicit"});
    expect(signerSpy).not.toHaveBeenCalled();
  });

  test("(f) live browser session is the active identity (wins over the keystore default)", async () => {
    const client = makeClient({getBeneficiaryVestings: vi.fn().mockResolvedValue([])});
    stub(client);
    // A session is live and no keystore opt-out, so resolveWalletMode → browser.
    vi.spyOn(action as any, "resolveWalletMode").mockReturnValue("browser");
    const sessionSpy = vi.spyOn(action as any, "liveSessionAddress").mockResolvedValue("0xSession");
    const signerSpy = vi.spyOn(action as any, "getSignerAddress").mockResolvedValue("0xKeystore");

    await action.execute({});

    expect(failSpy).not.toHaveBeenCalled();
    const summary = renderSpy.mock.calls[0][0];
    expect(summary.address).toBe("0xSession");
    expect(client.getBeneficiaryVestings).toHaveBeenCalledWith("0xSession", undefined);
    expect(sessionSpy).toHaveBeenCalled();
    // The keystore default must not be consulted once a live session resolves.
    expect(signerSpy).not.toHaveBeenCalled();
  });

  test("(g) explicit --account overrides a live session", async () => {
    const client = makeClient({getBeneficiaryVestings: vi.fn().mockResolvedValue([])});
    stub(client);
    const sessionSpy = vi.spyOn(action as any, "liveSessionAddress").mockResolvedValue("0xSession");
    vi.spyOn(action as any, "getSignerAddress").mockResolvedValue("0xKeystore");

    await action.execute({account: "clarke"});

    const summary = renderSpy.mock.calls[0][0];
    expect(summary.address).toBe("0xKeystore");
    // --account short-circuits before the session is ever consulted.
    expect(sessionSpy).not.toHaveBeenCalled();
  });
});
