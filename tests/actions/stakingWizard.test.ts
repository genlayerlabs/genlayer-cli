import {describe, test, vi, beforeEach, afterEach, expect} from "vitest";
import inquirer from "inquirer";
import {ValidatorWizardAction} from "../../src/commands/staking/wizard";
import {CreateAccountAction} from "../../src/commands/account/create";
import {ExportAccountAction} from "../../src/commands/account/export";
import {buildTx} from "../../src/lib/wallet/txBuilders";

vi.mock("inquirer");
vi.mock("../../src/commands/account/create");
vi.mock("../../src/commands/account/export");

const fsMock = vi.hoisted(() => ({
  readFileSync: vi.fn(() => JSON.stringify({address: "0xOperatorAddr"})),
  existsSync: vi.fn(() => false),
}));
vi.mock("fs", async importOriginal => {
  const actual = await importOriginal<typeof import("fs")>();
  const merged = {...actual, ...fsMock};
  return {...merged, default: merged};
});

// genlayer-js: the wizard balance-check uses createClient(...).getBalance/getEpochInfo.
// The vesting funding source additionally reads getBeneficiaryVestings /
// getVestingState / getValidatorWallets off the same (account-less) client.
// NOTE: implementations are passed to vi.fn() (not via a later .mockResolvedValue)
// so afterEach's vi.restoreAllMocks() reverts to THESE defaults rather than to an
// empty mock — the same reason `createClient: vi.fn(() => mockGlClient)` survives.
const mockGlClient = {
  getBalance: vi.fn(async () => 1000n * 10n ** 18n),
  getEpochInfo: vi.fn(async () => ({
    validatorMinStakeRaw: 42n * 10n ** 18n,
    validatorMinStake: "42 GEN",
    currentEpoch: 5n,
  })),
  getBeneficiaryVestings: vi.fn(async (_beneficiary?: string) => ["0xVesting"]),
  getVestingState: vi.fn(async () => ({
    totalAmountRaw: 100n * 10n ** 18n,
    totalWithdrawnRaw: 0n,
  })),
  getValidatorWallets: vi.fn(async () => ["0xVWallet"]),
};

vi.mock("genlayer-js", () => ({
  createClient: vi.fn(() => mockGlClient),
  createAccount: vi.fn(() => ({address: "0xMockedAddress"})),
  formatStakingAmount: vi.fn((val: bigint) => `${Number(val) / 1e18} GEN`),
  parseStakingAmount: vi.fn((val: string) => {
    const cleaned = val.toLowerCase().replace(/gen|eth/g, "");
    return BigInt(Math.floor(parseFloat(cleaned) * 1e18));
  }),
  abi: {STAKING_ABI: [], VESTING_ABI: []},
}));

// Pure tx-builders (real behavior covered in tests/libs/stakingTx.test.ts).
vi.mock("../../src/lib/wallet/stakingTx", () => ({
  buildValidatorJoinTx: vi.fn(() => ({to: "0xStaking", data: "0xjoin"})),
  buildSetIdentityTx: vi.fn(() => ({to: "0xValidatorWallet", data: "0xidentity"})),
  extractValidatorWallet: vi.fn(() => "0xValidatorWalletFromEvent"),
}));

// Generic vesting calldata builder (real behavior covered in tests/libs/txBuilders.test.ts).
vi.mock("../../src/lib/wallet/txBuilders", () => ({
  buildTx: vi.fn(() => ({to: "0xVesting", data: "0xvestingjoin"})),
}));

describe("ValidatorWizardAction --wallet browser (owner)", () => {
  let action: ValidatorWizardAction;
  let sendTransaction: ReturnType<typeof vi.fn>;
  let bridgeClose: ReturnType<typeof vi.fn>;
  let getBrowserWalletSessionSpy: any;
  let getStakingClientSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    action = new ValidatorWizardAction();

    // Silence spinners/logs.
    for (const m of [
      "startSpinner",
      "setSpinnerText",
      "succeedSpinner",
      "failSpinner",
      "stopSpinner",
      "logInfo",
      "logWarning",
      "logError",
      "log",
    ]) {
      vi.spyOn(action as any, m).mockImplementation(() => {});
    }

    // Network resolution -> a minimal chain with a staking contract.
    vi.spyOn(action as any, "getCustomNetworks").mockReturnValue({});
    vi.spyOn(action as any, "getConfigByKey").mockReturnValue("testnet-bradbury");
    vi.spyOn(action as any, "writeConfig").mockImplementation(() => {});

    // Browser session seam.
    sendTransaction = vi.fn().mockResolvedValue({
      transactionHash: "0xJoinHash",
      blockNumber: 10n,
      gasUsed: 1000n,
      status: "success",
    });
    bridgeClose = vi.fn().mockResolvedValue(undefined);
    getBrowserWalletSessionSpy = vi.spyOn(action as any, "getBrowserWalletSession").mockResolvedValue({
      bridge: {close: bridgeClose},
      kind: "local",
      sessionUrl: "http://127.0.0.1:1/#s=t",
      stakingAddress: "0xStaking",
      signerAddress: "0xBrowserOwner",
      sendTransaction,
      // The wizard finally block now calls session.close() (no-op for remote,
      // full close for own bridge). Delegate to bridgeClose so the assertion holds.
      close: bridgeClose,
    });

    // Ensure the keystore staking path is never exercised.
    getStakingClientSpy = vi.spyOn(action as any, "getStakingClient");

    // CreateAccount / ExportAccount are mocked classes.
    vi.mocked(CreateAccountAction.prototype.execute).mockResolvedValue(undefined as any);
    vi.mocked(ExportAccountAction.prototype.execute).mockResolvedValue(undefined as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("routes join through the bridge, keeps operator export, never uses keystore", async () => {
    // Prompt sequence:
    //  funding source -> wallet (default; original flow unchanged)
    //  step4 useOperator -> true; operatorChoice -> create; operatorName -> "op";
    //        export filename -> default; export password x2
    //  step5 stakeAmount -> "42gen"; confirm -> true
    //  step7 setupIdentity -> false (skip identity prompts)
    vi.mocked(inquirer.prompt)
      .mockResolvedValueOnce({stakeSource: "wallet"}) // funding source
      .mockResolvedValueOnce({useOperator: true}) // step4
      .mockResolvedValueOnce({operatorChoice: "create"})
      .mockResolvedValueOnce({operatorName: "op"})
      .mockResolvedValueOnce({outputFilename: "op-keystore.json"})
      .mockResolvedValueOnce({exportPassword: "password123"})
      .mockResolvedValueOnce({confirmPassword: "password123"})
      .mockResolvedValueOnce({stakeAmount: "42gen"}) // step5
      .mockResolvedValueOnce({confirm: true})
      .mockResolvedValueOnce({setupIdentity: false}); // step7

    // listAccounts is used inside step4 (create operator uniqueness check).
    vi.spyOn(action as any, "listAccounts").mockReturnValue([]);

    await action.execute({amount: "", wallet: "browser", network: "testnet-bradbury"} as any);

    // Bridge was started once (via ensureBrowserSession) and closed in finally.
    expect(getBrowserWalletSessionSpy).toHaveBeenCalledWith(
      expect.objectContaining({network: "testnet-bradbury"}),
      "wizard",
    );
    expect(bridgeClose).toHaveBeenCalled();

    // Join tx went through the bridge, not the keystore staking client.
    expect(sendTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "0xStaking",
        data: "0xjoin",
        label: expect.stringContaining("Join as validator"),
      }),
    );
    expect(getStakingClientSpy).not.toHaveBeenCalled();

    // Operator keystore export still happened (step 4 unchanged).
    expect(ExportAccountAction.prototype.execute).toHaveBeenCalled();

    // Validator created spinner fired with the decoded wallet.
    expect(action["succeedSpinner"]).toHaveBeenCalledWith(
      "Validator created successfully!",
      expect.objectContaining({validatorWallet: "0xValidatorWalletFromEvent"}),
    );
  });

  test("vesting source: browser owner sends vestingValidatorJoin through the same session", async () => {
    mockGlClient.getBeneficiaryVestings.mockResolvedValue(["0xVesting"]);

    // funding source -> vesting (one contract, no pick prompt)
    // step4 useOperator -> true; operatorChoice -> existing; operatorAddress
    // step5 stakeAmount -> "42gen"; confirm -> true
    // (identity is skipped for vesting-backed validators)
    vi.mocked(inquirer.prompt)
      .mockResolvedValueOnce({stakeSource: "vesting"})
      .mockResolvedValueOnce({useOperator: true})
      .mockResolvedValueOnce({operatorChoice: "existing"})
      .mockResolvedValueOnce({operatorAddress: "0xOperatorAddr"})
      .mockResolvedValueOnce({stakeAmount: "42gen"})
      .mockResolvedValueOnce({confirm: true});

    vi.spyOn(action as any, "listAccounts").mockReturnValue([]);

    await action.execute({amount: "", wallet: "browser", network: "testnet-bradbury"} as any);

    // Beneficiary lookup used the connected browser address.
    expect(mockGlClient.getBeneficiaryVestings).toHaveBeenCalledWith("0xBrowserOwner");

    // Calldata was built for vestingValidatorJoin with the chosen operator + amount.
    expect(vi.mocked(buildTx)).toHaveBeenCalledWith([], "0xVesting", "vestingValidatorJoin", [
      "0xOperatorAddr",
      42n * 10n ** 18n,
    ]);

    // Join went through the SAME browser session, no msg.value, never the keystore.
    expect(sendTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "0xVesting",
        data: "0xvestingjoin",
        label: expect.stringContaining("Create vesting validator"),
      }),
    );
    expect(sendTransaction.mock.calls[0][0].value).toBeUndefined();
    expect(getStakingClientSpy).not.toHaveBeenCalled();

    expect(action["succeedSpinner"]).toHaveBeenCalledWith(
      "Vesting-backed validator created successfully!",
      expect.objectContaining({vesting: "0xVesting", validatorWallet: "0xVWallet"}),
    );
  });

  test("keystore path is untouched: --account + --wallet browser is rejected up-front", async () => {
    await expect(action.execute({amount: "", wallet: "browser", account: "owner"} as any)).rejects.toThrow(
      /--account cannot be used with --wallet browser/,
    );
    expect(getBrowserWalletSessionSpy).not.toHaveBeenCalled();
  });
});

describe("ValidatorWizardAction stake source (keystore owner)", () => {
  let action: ValidatorWizardAction;
  let validatorJoin: ReturnType<typeof vi.fn>;
  let vestingValidatorJoin: ReturnType<typeof vi.fn>;
  let getStakingClientSpy: any;
  let getBrowserWalletSessionSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    action = new ValidatorWizardAction();

    for (const m of [
      "startSpinner",
      "setSpinnerText",
      "succeedSpinner",
      "failSpinner",
      "stopSpinner",
      "logInfo",
      "logWarning",
      "logError",
      "log",
    ]) {
      vi.spyOn(action as any, m).mockImplementation(() => {});
    }

    vi.spyOn(action as any, "getCustomNetworks").mockReturnValue({});
    vi.spyOn(action as any, "getConfigByKey").mockReturnValue("testnet-bradbury");
    vi.spyOn(action as any, "writeConfig").mockImplementation(() => {});

    // Keystore owner "owner" -> 0xOwner (short-circuits account-selection prompts).
    vi.spyOn(action as any, "accountExists").mockReturnValue(true);
    vi.spyOn(action as any, "getKeystorePath").mockReturnValue("/tmp/owner-keystore.json");
    vi.spyOn(action as any, "getSignerAddress").mockResolvedValue("0xOwner");
    vi.spyOn(action as any, "listAccounts").mockReturnValue([]);

    // The browser bridge must never start in keystore mode.
    getBrowserWalletSessionSpy = vi.spyOn(action as any, "getBrowserWalletSession").mockImplementation(() => {
      throw new Error("browser session must not start in keystore mode");
    });

    // Signing client exposes both the wallet (validatorJoin) and the vesting
    // (vestingValidatorJoin) create methods; each test asserts which one ran.
    validatorJoin = vi.fn().mockResolvedValue({
      validatorWallet: "0xWalletFromJoin",
      transactionHash: "0xJoinTx",
      amount: "42 GEN",
      operator: "0xOwner",
      blockNumber: 11n,
    });
    vestingValidatorJoin = vi.fn().mockResolvedValue({
      validatorWallet: "0xVWalletCreated",
      transactionHash: "0xVJoinTx",
      operator: "0xOwner",
      amount: "42 GEN",
      blockNumber: 12n,
      gasUsed: 100n,
    });
    getStakingClientSpy = vi.spyOn(action as any, "getStakingClient").mockResolvedValue({
      validatorJoin,
      vestingValidatorJoin,
      getValidatorWallets: vi.fn().mockResolvedValue(["0xVWalletCreated"]),
    } as any);

    vi.mocked(CreateAccountAction.prototype.execute).mockResolvedValue(undefined as any);
    vi.mocked(ExportAccountAction.prototype.execute).mockResolvedValue(undefined as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const run = (extra: Record<string, any> = {}) =>
    action.execute({
      amount: "",
      account: "owner",
      wallet: "keystore",
      network: "testnet-bradbury",
      ...extra,
    } as any);

  test("(a) wallet source keeps the original flow — no vesting lookup, uses validatorJoin", async () => {
    vi.mocked(inquirer.prompt)
      .mockResolvedValueOnce({stakeSource: "wallet"})
      .mockResolvedValueOnce({useOperator: false})
      .mockResolvedValueOnce({stakeAmount: "42gen"})
      .mockResolvedValueOnce({confirm: true})
      .mockResolvedValueOnce({setupIdentity: false});

    await run();

    expect(validatorJoin).toHaveBeenCalledWith({amount: 42n * 10n ** 18n, operator: "0xOwner"});
    expect(vestingValidatorJoin).not.toHaveBeenCalled();
    expect(mockGlClient.getBeneficiaryVestings).not.toHaveBeenCalled();
    expect(action["succeedSpinner"]).toHaveBeenCalledWith(
      "Validator created successfully!",
      expect.objectContaining({validatorWallet: "0xWalletFromJoin"}),
    );
  });

  test("(b) vesting source, one contract: vestingValidatorJoin with the chosen operator + amount", async () => {
    mockGlClient.getBeneficiaryVestings.mockResolvedValue(["0xVesting"]);
    vi.mocked(inquirer.prompt)
      .mockResolvedValueOnce({stakeSource: "vesting"})
      .mockResolvedValueOnce({useOperator: true})
      .mockResolvedValueOnce({operatorChoice: "existing"})
      .mockResolvedValueOnce({operatorAddress: "0xOperatorAddr"})
      .mockResolvedValueOnce({stakeAmount: "42gen"})
      .mockResolvedValueOnce({confirm: true});

    await run();

    expect(mockGlClient.getBeneficiaryVestings).toHaveBeenCalledWith("0xOwner");
    expect(vestingValidatorJoin).toHaveBeenCalledWith({
      vesting: "0xVesting",
      operator: "0xOperatorAddr",
      amount: 42n * 10n ** 18n,
    });
    expect(validatorJoin).not.toHaveBeenCalled();
    expect(action["succeedSpinner"]).toHaveBeenCalledWith(
      "Vesting-backed validator created successfully!",
      expect.objectContaining({vesting: "0xVesting", validatorWallet: "0xVWalletCreated"}),
    );
  });

  test("(d) vesting source with no contracts warns and loops back to wallet — no crash", async () => {
    mockGlClient.getBeneficiaryVestings.mockResolvedValue([]);
    vi.mocked(inquirer.prompt)
      .mockResolvedValueOnce({stakeSource: "vesting"}) // none found -> warn + loop
      .mockResolvedValueOnce({stakeSource: "wallet"}) // recover onto wallet flow
      .mockResolvedValueOnce({useOperator: false})
      .mockResolvedValueOnce({stakeAmount: "42gen"})
      .mockResolvedValueOnce({confirm: true})
      .mockResolvedValueOnce({setupIdentity: false});

    await run();

    expect(mockGlClient.getBeneficiaryVestings).toHaveBeenCalledWith("0xOwner");
    expect(action["logWarning"]).toHaveBeenCalledWith(expect.stringMatching(/No vesting contracts found/));
    expect(validatorJoin).toHaveBeenCalledOnce();
    expect(vestingValidatorJoin).not.toHaveBeenCalled();
  });

  test("(e) multiple vesting contracts: prompts to pick and uses the chosen one", async () => {
    mockGlClient.getBeneficiaryVestings.mockResolvedValue(["0xV1", "0xV2"]);
    vi.mocked(inquirer.prompt)
      .mockResolvedValueOnce({stakeSource: "vesting"})
      .mockResolvedValueOnce({selectedVesting: "0xV2"})
      .mockResolvedValueOnce({useOperator: false})
      .mockResolvedValueOnce({stakeAmount: "42gen"})
      .mockResolvedValueOnce({confirm: true});

    await run();

    const promptCalls = vi.mocked(inquirer.prompt).mock.calls;
    const askedToPick = promptCalls.some((c: any) => c[0]?.[0]?.name === "selectedVesting");
    expect(askedToPick).toBe(true);

    expect(vestingValidatorJoin).toHaveBeenCalledWith({
      vesting: "0xV2",
      operator: "0xOwner",
      amount: 42n * 10n ** 18n,
    });
    expect(validatorJoin).not.toHaveBeenCalled();
  });
});
