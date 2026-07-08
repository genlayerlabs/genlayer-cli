import {describe, test, vi, beforeEach, afterEach, expect} from "vitest";
import inquirer from "inquirer";
import {ValidatorWizardAction} from "../../src/commands/staking/wizard";
import {CreateAccountAction} from "../../src/commands/account/create";
import {ExportAccountAction} from "../../src/commands/account/export";

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
const mockGlClient = {
  getBalance: vi.fn().mockResolvedValue(1000n * 10n ** 18n),
  getEpochInfo: vi.fn().mockResolvedValue({
    validatorMinStakeRaw: 42n * 10n ** 18n,
    validatorMinStake: "42 GEN",
    currentEpoch: 5n,
  }),
};

vi.mock("genlayer-js", () => ({
  createClient: vi.fn(() => mockGlClient),
  createAccount: vi.fn(() => ({address: "0xMockedAddress"})),
  formatStakingAmount: vi.fn((val: bigint) => `${Number(val) / 1e18} GEN`),
  parseStakingAmount: vi.fn((val: string) => {
    const cleaned = val.toLowerCase().replace(/gen|eth/g, "");
    return BigInt(Math.floor(parseFloat(cleaned) * 1e18));
  }),
  abi: {STAKING_ABI: []},
}));

// Pure tx-builders (real behavior covered in tests/libs/stakingTx.test.ts).
vi.mock("../../src/lib/wallet/stakingTx", () => ({
  buildValidatorJoinTx: vi.fn(() => ({to: "0xStaking", data: "0xjoin"})),
  buildSetIdentityTx: vi.fn(() => ({to: "0xValidatorWallet", data: "0xidentity"})),
  extractValidatorWallet: vi.fn(() => "0xValidatorWalletFromEvent"),
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
      stakingAddress: "0xStaking",
      signerAddress: "0xBrowserOwner",
      sendTransaction,
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
    //  step4 useOperator -> true; operatorChoice -> create; operatorName -> "op";
    //        export filename -> default; export password x2
    //  step5 stakeAmount -> "42gen"; confirm -> true
    //  step7 setupIdentity -> false (skip identity prompts)
    vi.mocked(inquirer.prompt)
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

  test("keystore path is untouched: --account + --wallet browser is rejected up-front", async () => {
    await expect(action.execute({amount: "", wallet: "browser", account: "owner"} as any)).rejects.toThrow(
      /--account cannot be used with --wallet browser/,
    );
    expect(getBrowserWalletSessionSpy).not.toHaveBeenCalled();
  });
});
