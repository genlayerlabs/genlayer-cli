// @vitest-environment node
import {beforeEach, afterEach, describe, it, expect, vi} from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {Command} from "commander";
import {of} from "rxjs";
import {Wallet, Transaction} from "ethers";
import {recoverTransactionAddress, type TransactionSerialized} from "viem";
import {initializeAccountCommands} from "../../src/commands/account";
import {BaseAction} from "../../src/lib/actions/BaseAction";
import {StakingAction} from "../../src/commands/staking/StakingAction";
import {VestingAction} from "../../src/commands/vesting/VestingAction";
import {SendAction} from "../../src/commands/account/send";
import {ShowAccountAction} from "../../src/commands/account/show";
import {ExportAccountAction} from "../../src/commands/account/export";
import {UnlockAccountAction} from "../../src/commands/account/unlock";
import {ImportAccountAction} from "../../src/commands/account/import";
import {createClient} from "genlayer-js";
import {ValidatorJoinAction} from "../../src/commands/staking/validatorJoin";
import {ValidatorWizardAction} from "../../src/commands/staking/wizard";

const mocks = vi.hoisted(() => ({
  withLedger: vi.fn(),
  getPrivateKey: vi.fn(),
  removePrivateKey: vi.fn(),
  storePrivateKey: vi.fn(),
}));
vi.mock("../../src/lib/accounts/ledgerDevice", async original => ({
  ...(await original<object>()),
  withLedger: mocks.withLedger,
}));
vi.mock("../../src/lib/config/KeychainManager", () => ({
  KeychainManager: class {
    getPrivateKey = mocks.getPrivateKey;
    removePrivateKey = mocks.removePrivateKey;
    storePrivateKey = mocks.storePrivateKey;
    isKeychainAvailable = async () => true;
    isAccountUnlocked = async () => false;
  },
}));
vi.mock("genlayer-js", async original => ({...(await original<object>()), createClient: vi.fn()}));
const wallet = new Wallet(`0x${"11".repeat(32)}`);
let home: string;
let signed: string;
let prompt: ReturnType<typeof vi.spyOn>;
const metadata = {type: "ledger", address: wallet.address, derivationPath: "44'/60'/0'/0/0"};
const tx = {
  type: "legacy" as const,
  chainId: 4221,
  gas: 21000n,
  gasPrice: 10n,
  nonce: 0,
  value: 1n,
  to: wallet.address as `0x${string}`,
};
class ContractHarness extends BaseAction {
  client(readOnly = false) {
    return this.getClient(undefined, readOnly);
  }
}
class StakingHarness extends StakingAction {
  registration(client: any) {
    return this.createValidatorRegistration(client);
  }
  client() {
    return this.getStakingClient({account: "usb"});
  }
}
class VestingHarness extends VestingAction {
  registration(client: any) {
    return this.createVestingValidatorRegistration(
      client,
      wallet.address as `0x${string}`,
      wallet.address as `0x${string}`,
    );
  }
  client() {
    return this.getVestingClient({account: "usb"});
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  home = fs.mkdtempSync(path.join(os.tmpdir(), "genlayer-ledger-test-"));
  vi.spyOn(os, "homedir").mockReturnValue(home);
  for (const method of [
    "startSpinner",
    "stopSpinner",
    "setSpinnerText",
    "succeedSpinner",
    "logSuccess",
    "logInfo",
  ] as const) {
    vi.spyOn(BaseAction.prototype as any, method).mockImplementation(() => {});
  }
  vi.spyOn(BaseAction.prototype as any, "failSpinner").mockImplementation((message, error) => {
    throw error || new Error(String(message));
  });
  prompt = vi
    .spyOn(BaseAction.prototype as any, "promptPassword")
    .mockRejectedValue(new Error("Unexpected password prompt"));
  mocks.withLedger.mockImplementation(async operation =>
    operation({
      getAddress: () => ({
        observable: of({status: "completed", output: {address: wallet.address}}),
        cancel() {},
      }),
      signTransaction: (_path: string, bytes: Uint8Array) => {
        const request = Transaction.from(`0x${Buffer.from(bytes).toString("hex")}`);
        const signature = wallet.signingKey.sign(request.unsignedHash);
        return {
          observable: of({status: "completed", output: {r: signature.r, s: signature.s, v: signature.v}}),
          cancel() {},
        };
      },
    }),
  );
  vi.mocked(createClient).mockImplementation(
    ({account}: any) =>
      ({
        account,
        getBalance: async () => 1n,
        getCurrentNonce: async () => 0n,
        prepareTransactionRequest: async (request: any) => ({...tx, ...request}),
        sendRawTransaction: async ({serializedTransaction}: any) => {
          signed = serializedTransaction;
          return "0x123";
        },
        getTransactionReceipt: async () => ({status: "success", blockNumber: 1n, gasUsed: 21000n}),
      }) as any,
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(home, {recursive: true, force: true});
});

async function importAccount() {
  const program = new Command();
  initializeAccountCommands(program);
  await program.parseAsync(["node", "genlayer", "account", "import", "--name", "usb", "--ledger"]);
}

describe("Ledger command integration", () => {
  it("imports via Commander, persists only metadata, and lists the account", async () => {
    await importAccount();
    const action = new ContractHarness();
    expect(JSON.parse(fs.readFileSync(action.getKeystorePath("usb"), "utf8"))).toEqual(metadata);
    expect(action.getActiveAccount()).toBe("usb");
    expect(action.listAccounts()[0].address).toBe(wallet.address);
    expect(mocks.removePrivateKey).toHaveBeenCalledWith("usb");
    expect(prompt).not.toHaveBeenCalled();
  });
  it("passes a device signer to contract, staking and vesting clients", async () => {
    await importAccount();
    const clients = [
      await new ContractHarness().client(),
      await new StakingHarness().client(),
      await new VestingHarness().client(),
    ];
    for (const account of clients.map(client => client.account)) {
      const serializedTransaction = await (account as any).signTransaction(tx);
      expect(await recoverTransactionAddress({serializedTransaction})).toBe(wallet.address);
    }
    expect(mocks.getPrivateKey).not.toHaveBeenCalled();
    expect(prompt).not.toHaveBeenCalled();
  });
  it("sends a transfer signed by the device", async () => {
    await importAccount();
    await new SendAction().execute({account: "usb", to: wallet.address, amount: "1"});
    expect(await recoverTransactionAddress({serializedTransaction: signed as TransactionSerialized})).toBe(
      wallet.address,
    );
    expect(mocks.getPrivateKey).not.toHaveBeenCalled();
  });
  it("reads balances and initializes a read-only client without connecting a device", async () => {
    await importAccount();
    mocks.withLedger.mockClear();
    expect((await new ContractHarness().client(true)).account).toBe(wallet.address);
    await new ShowAccountAction().execute({account: "usb"});
    expect(mocks.withLedger).not.toHaveBeenCalled();
  });
  it("refuses export and unlock without retrieving cached keys", async () => {
    await importAccount();
    await expect(
      new ExportAccountAction().execute({account: "usb", output: path.join(home, "export.json")}),
    ).rejects.toThrow("cannot be exported");
    await expect(new UnlockAccountAction().execute({account: "usb"})).rejects.toThrow("cannot be unlocked");
    expect(mocks.getPrivateKey).not.toHaveBeenCalled();
    expect(mocks.storePrivateKey).not.toHaveBeenCalled();
  });
  it("preserves existing accounts unless overwrite is explicit", async () => {
    await importAccount();
    mocks.withLedger.mockClear();
    await expect(importAccount()).rejects.toThrow("already exists");
    expect(mocks.withLedger).not.toHaveBeenCalled();
  });
  it("does not write metadata when device import fails", async () => {
    mocks.withLedger.mockRejectedValue(new Error("User rejected"));
    const action = new ImportAccountAction();
    await expect(action.execute({ledger: true, name: "usb", overwrite: false})).rejects.toThrow(
      "User rejected",
    );
    expect(action.accountExists("usb")).toBe(false);
  });
  it.each([{ledger: true, privateKey: "unused"}, {derivationPath: "44'/60'/1'/0/0"}])(
    "rejects conflicting options before accessing the device: %j",
    async options => {
      await expect(
        new ImportAccountAction().execute({name: "usb", overwrite: false, ...options}),
      ).rejects.toThrow();
      expect(mocks.withLedger).not.toHaveBeenCalled();
    },
  );
});

describe("Ledger operator-proof errors", () => {
  const context = {chainId: 4221n, registrar: wallet.address, owner: wallet.address};
  it.each([undefined, wallet.address])(
    "validator join with Ledger operator %s fails before signing",
    async operator => {
      await importAccount();
      const client = {getValidatorRegistrationContext: async () => context, validatorJoin: vi.fn()};
      const action = new ValidatorJoinAction();
      vi.spyOn(action as any, "getStakingClient").mockResolvedValue(client);
      await expect(action.execute({amount: "1gen", operator})).rejects.toThrow(
        "Pass --operator <address> for a separate local software keystore",
      );
      expect(client.validatorJoin).not.toHaveBeenCalled();
      expect(mocks.getPrivateKey).not.toHaveBeenCalled();
      expect(prompt).not.toHaveBeenCalled();
    },
  );
  it("rejects the Ledger operator on the shared wizard proof path", async () => {
    await importAccount();
    const action = new ValidatorWizardAction();
    await expect(
      (action as any).createValidatorRegistration(
        {getValidatorRegistrationContext: async () => context},
        "usb",
      ),
    ).rejects.toThrow("A Ledger account cannot sign the operator proof");
    expect(mocks.getPrivateKey).not.toHaveBeenCalled();
  });
  it("rejects a Ledger operator in vesting validator registration", async () => {
    await importAccount();
    await expect(
      new VestingHarness().registration({getVestingValidatorRegistrationContext: async () => context}),
    ).rejects.toThrow("Pass --operator <address> for a separate local software keystore");
    expect(mocks.getPrivateKey).not.toHaveBeenCalled();
    expect(prompt).not.toHaveBeenCalled();
  });
});
