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
    ...overrides,
  };
}

function makeStakeInfo(overrides: Record<string, any> = {}) {
  return {
    delegator: "0xV1",
    validator: "0xVal1",
    shares: 0n,
    stake: "",
    stakeRaw: 0n,
    pendingDeposits: [],
    pendingWithdrawals: [],
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
    getStakeInfo: vi.fn(),
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

  test("(b) one vesting with self-stake + a delegation → committed & available computed", async () => {
    const client = makeClient({
      getBeneficiaryVestings: vi.fn().mockResolvedValue(["0xV1"]),
      getVestingState: vi.fn().mockResolvedValue(makeState({vestedAmountRaw: 20n * WEI, totalWithdrawnRaw: 2n * WEI})),
      getValidatorWallets: vi.fn().mockResolvedValue(["0xW1"]),
      validatorDeposited: vi.fn().mockResolvedValue(5n * WEI), // self-stake 5
      getActiveValidators: vi.fn().mockResolvedValue(["0xVal1"]),
      getStakeInfo: vi.fn().mockResolvedValue(
        makeStakeInfo({
          stakeRaw: 3n * WEI, // active delegated 3
          pendingDeposits: [{stakeRaw: 1n * WEI}], // + 1 activating
          pendingWithdrawals: [],
        }),
      ),
    });
    stub(client);
    vi.spyOn(action as any, "getSignerAddress").mockResolvedValue("0xBen");

    await action.execute({});

    expect(failSpy).not.toHaveBeenCalled();
    const summary = renderSpy.mock.calls[0][0];
    expect(summary.vestings).toHaveLength(1);
    const v = summary.vestings[0];
    expect(v.selfStakeRaw).toBe(5n * WEI);
    expect(v.delegatedRaw).toBe(4n * WEI); // 3 active + 1 pending
    expect(v.committedRaw).toBe(9n * WEI);
    // available ≈ vested(20) − withdrawn(2) − committed(9) = 9
    expect(v.availableToStakeRaw).toBe(9n * WEI);
    // getStakeInfo takes (delegator=vesting, validator).
    expect(client.getStakeInfo).toHaveBeenCalledWith("0xV1", "0xVal1");
    expect(client.validatorDeposited).toHaveBeenCalledWith("0xV1", "0xW1");
  });

  test("(b') available-to-stake floors at 0 when committed exceeds vested", async () => {
    const client = makeClient({
      getBeneficiaryVestings: vi.fn().mockResolvedValue(["0xV1"]),
      getVestingState: vi.fn().mockResolvedValue(makeState({vestedAmountRaw: 5n * WEI, totalWithdrawnRaw: 0n})),
      getValidatorWallets: vi.fn().mockResolvedValue(["0xW1"]),
      validatorDeposited: vi.fn().mockResolvedValue(10n * WEI), // committed > vested
      getActiveValidators: vi.fn().mockResolvedValue([]),
    });
    stub(client);
    vi.spyOn(action as any, "getSignerAddress").mockResolvedValue("0xBen");

    await action.execute({});

    const v = renderSpy.mock.calls[0][0].vestings[0];
    expect(v.committedRaw).toBe(10n * WEI);
    expect(v.availableToStakeRaw).toBe(0n);
  });

  test("(c) multiple vesting contracts each summarized; validator set fetched once", async () => {
    const stateA = makeState({name: "A", vestedAmountRaw: 20n * WEI, totalWithdrawnRaw: 0n});
    const stateB = makeState({name: "B", vestedAmountRaw: 50n * WEI, totalWithdrawnRaw: 5n * WEI});
    const client = makeClient({
      getBeneficiaryVestings: vi.fn().mockResolvedValue(["0xVA", "0xVB"]),
      getVestingState: vi.fn().mockImplementation((addr: string) => (addr === "0xVA" ? stateA : stateB)),
      getValidatorWallets: vi.fn().mockResolvedValue([]),
      getActiveValidators: vi.fn().mockResolvedValue([]),
    });
    stub(client);
    vi.spyOn(action as any, "getSignerAddress").mockResolvedValue("0xBen");

    await action.execute({});

    const summary = renderSpy.mock.calls[0][0];
    expect(summary.vestings).toHaveLength(2);
    expect(summary.vestings[0].name).toBe("A");
    expect(summary.vestings[0].availableToStakeRaw).toBe(20n * WEI); // 20 - 0 - 0
    expect(summary.vestings[1].name).toBe("B");
    expect(summary.vestings[1].availableToStakeRaw).toBe(45n * WEI); // 50 - 5 - 0
    // Active validator set is global: fetched once and reused across vestings.
    expect(client.getActiveValidators).toHaveBeenCalledTimes(1);
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
});
