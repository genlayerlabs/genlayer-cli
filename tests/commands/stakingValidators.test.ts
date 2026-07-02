import {afterEach, beforeEach, describe, expect, test, vi} from "vitest";
import {ValidatorsAction} from "../../src/commands/staking/validators";

const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";
const OWNER = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const OPERATOR = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const GEN = 10n ** 18n;

function rawGen(amount: number): bigint {
  return BigInt(amount) * GEN;
}

function validatorInfo(address: string, selfStake: number, delegatedStake: number, moniker: string) {
  return {
    address,
    owner: OWNER,
    operator: OPERATOR,
    vStake: `${selfStake} GEN`,
    vStakeRaw: rawGen(selfStake),
    vShares: 0n,
    dStake: `${delegatedStake} GEN`,
    dStakeRaw: rawGen(delegatedStake),
    dShares: 0n,
    vDeposit: "0 GEN",
    vDepositRaw: 0n,
    vWithdrawal: "0 GEN",
    vWithdrawalRaw: 0n,
    ePrimed: 5n,
    live: true,
    banned: false,
    needsPriming: false,
    identity: {moniker},
    pendingDeposits: [],
    pendingWithdrawals: [],
  } as any;
}

function jsonResponse(body: unknown) {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue(body),
  } as any;
}

function createMockClient() {
  const infos = new Map([
    [A.toLowerCase(), validatorInfo(A, 100, 20, "Alpha")],
    [B.toLowerCase(), validatorInfo(B, 50, 10, "Beta")],
  ]);

  return {
    getActiveValidators: vi.fn().mockResolvedValue([A]),
    getQuarantinedValidatorsDetailed: vi.fn().mockResolvedValue([]),
    getBannedValidators: vi.fn().mockResolvedValue([]),
    getEpochInfo: vi.fn().mockResolvedValue({currentEpoch: 6n}),
    getValidatorInfo: vi.fn((address: string) => Promise.resolve(infos.get(address.toLowerCase()))),
  };
}

function setupAction(mockClient = createMockClient()) {
  const action = new ValidatorsAction();

  vi.spyOn(action as any, "startSpinner").mockImplementation(() => undefined);
  vi.spyOn(action as any, "setSpinnerText").mockImplementation(() => undefined);
  vi.spyOn(action as any, "stopSpinner").mockImplementation(() => undefined);
  vi.spyOn(action as any, "failSpinner").mockImplementation((message: unknown, error?: unknown) => {
    throw new Error(`${message}: ${String(error)}`);
  });
  vi.spyOn(action as any, "getReadOnlyStakingClient").mockResolvedValue(mockClient);
  vi.spyOn(action as any, "getAllValidatorsFromTree").mockResolvedValue([A, B]);
  vi.spyOn(action as any, "getSignerAddress").mockRejectedValue(new Error("no account"));
  vi.spyOn(action as any, "getConfig").mockReturnValue({network: "localnet"});
  vi.spyOn(action as any, "formatAmount").mockImplementation((amount: unknown) => String((amount as bigint) / GEN) + " GEN");

  return action;
}

describe("staking validators action", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("emits chain-only JSON without requiring explorer", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const action = setupAction();
    await action.execute({json: true});

    const output = JSON.parse(logSpy.mock.calls.at(-1)?.[0] as string);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(output.explorer).toEqual({enabled: false, url: null});
    expect(output.validators).toHaveLength(2);
    expect(output.validators[0].address).toBe(A);
    expect(output.validators[0].active).toBe(true);
    expect(output.validators[0].stake.totalRaw).toBe(rawGen(120).toString());
    expect(output.validators[0].delegatorCount).toBeNull();
    expect(output.validators[0].performance).toBeNull();
  });

  test("merges explorer performance and sorts by uptime", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith("https://explorer.example.com/api/v1/validators")) {
        return jsonResponse({
          total: 2,
          validators: [
            {validator_address: A, idle_pct_7d: 10, rotation_pct_7d: 2, minority_pct_7d: 1, apy: "5.00%", transaction_count: 7},
            {validator_address: B, idle_pct_7d: 1, rotation_pct_7d: 0, minority_pct_7d: 0, apy: "4.00%", transaction_count: 9},
          ],
        });
      }

      if (url === `https://explorer.example.com/api/v1/address/${A}`) {
        return jsonResponse({validator: {delegators: [{}], total_votes_7d: 11, minority_votes_7d: 1, successful_appeals_7d: 0}});
      }

      if (url === `https://explorer.example.com/api/v1/address/${B}`) {
        return jsonResponse({validator: {delegators: [{}, {}], total_votes_7d: 21, minority_votes_7d: 0, successful_appeals_7d: 1}});
      }

      return {ok: false, json: vi.fn()} as any;
    });
    vi.stubGlobal("fetch", fetchMock);

    const action = setupAction();
    await action.execute({json: true, explorerUrl: "https://explorer.example.com", sortBy: "uptime"});

    const output = JSON.parse(logSpy.mock.calls.at(-1)?.[0] as string);

    expect(output.explorer).toEqual({
      enabled: true,
      url: "https://explorer.example.com",
      endpoint: "https://explorer.example.com/api/v1/validators",
    });
    expect(output.sortBy).toBe("uptime");
    expect(output.validators[0].address).toBe(B);
    expect(output.validators[0].delegatorCount).toBe(2);
    expect(output.validators[0].performance.uptimePct).toBe(99);
    expect(output.validators[0].performance.totalVotes7d).toBe(21);
    expect(output.validators[1].address).toBe(A);
  });
});
