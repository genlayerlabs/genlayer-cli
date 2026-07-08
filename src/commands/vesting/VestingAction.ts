import {BaseAction, BUILT_IN_NETWORKS, resolveNetwork} from "../../lib/actions/BaseAction";
import {createClient, createAccount, formatStakingAmount, parseStakingAmount} from "genlayer-js";
import type {Address, GenLayerChain} from "genlayer-js/types";
import {existsSync, readFileSync} from "fs";
import {ethers} from "ethers";
import type {VestingClient, VestingFactoryLookupOptions} from "./vestingTypes";

export {BUILT_IN_NETWORKS};

export interface VestingConfig {
  rpc?: string;
  network?: string;
  account?: string;
  password?: string;
  vesting?: string;
  factory?: string;
  addressManager?: string;
}

export class VestingAction extends BaseAction {
  private _vestingClient: VestingClient | null = null;
  private _passwordOverride: string | undefined;

  constructor() {
    super();
  }

  private getNetwork(config: VestingConfig): GenLayerChain {
    if (config.network) {
      return {...resolveNetwork(config.network, this.getCustomNetworks())};
    }

    return resolveNetwork(this.getConfig().network, this.getCustomNetworks());
  }

  protected async getVestingClient(config: VestingConfig): Promise<VestingClient> {
    if (!this._vestingClient) {
      if (config.account) {
        this.accountOverride = config.account;
      }
      if (config.password) {
        this._passwordOverride = config.password;
      }

      const network = this.getNetwork(config);
      const privateKey = await this.getPrivateKeyForVesting();
      const account = createAccount(privateKey as `0x${string}`);

      this._vestingClient = createClient({
        chain: network,
        endpoint: config.rpc,
        account,
      }) as VestingClient;
    }
    return this._vestingClient;
  }

  protected async getReadOnlyVestingClient(config: VestingConfig): Promise<VestingClient> {
    if (config.account) {
      this.accountOverride = config.account;
    }

    const network = this.getNetwork(config);

    return createClient({
      chain: network,
      endpoint: config.rpc,
    }) as VestingClient;
  }

  private async getPrivateKeyForVesting(): Promise<string> {
    const accountName = this.resolveAccountName();
    const keystorePath = this.getKeystorePath(accountName);

    if (!existsSync(keystorePath)) {
      throw new Error(`Account '${accountName}' not found. Run 'genlayer account create --name ${accountName}' first.`);
    }

    const keystoreJson = readFileSync(keystorePath, "utf-8");
    const keystoreData = JSON.parse(keystoreJson);

    if (!this.isValidKeystoreFormat(keystoreData)) {
      throw new Error("Invalid keystore format.");
    }

    const cachedKey = await this.keychainManager.getPrivateKey(accountName);
    if (cachedKey) {
      const tempAccount = createAccount(cachedKey as `0x${string}`);
      const cachedAddress = tempAccount.address.toLowerCase();
      const keystoreAddress = `0x${keystoreData.address.toLowerCase().replace(/^0x/, '')}`;

      if (cachedAddress !== keystoreAddress) {
        await this.keychainManager.removePrivateKey(accountName);
      } else {
        return cachedKey;
      }
    }

    let password: string;
    if (this._passwordOverride) {
      password = this._passwordOverride;
    } else {
      this.stopSpinner();
      password = await this.promptPassword(`Enter password to unlock account '${accountName}':`);
    }
    this.startSpinner("Unlocking account...");

    const wallet = await ethers.Wallet.fromEncryptedJson(keystoreJson, password);
    return wallet.privateKey;
  }

  protected parseAmount(amount: string): bigint {
    return parseStakingAmount(amount);
  }

  protected formatAmount(amount: bigint): string {
    return formatStakingAmount(amount);
  }

  protected async getSignerAddress(): Promise<Address> {
    const accountName = this.resolveAccountName();
    const keystorePath = this.getKeystorePath(accountName);
    if (!existsSync(keystorePath)) {
      throw new Error(`Account '${accountName}' not found.`);
    }
    const keystoreData = JSON.parse(readFileSync(keystorePath, "utf-8"));
    const addr = keystoreData.address as string;
    return (addr.startsWith("0x") ? addr : `0x${addr}`) as Address;
  }

  protected getFactoryLookupOptions(options: VestingConfig): VestingFactoryLookupOptions | undefined {
    const lookup: VestingFactoryLookupOptions = {};
    if (options.factory) lookup.factory = options.factory as Address;
    if (options.addressManager) lookup.addressManager = options.addressManager as Address;
    return Object.keys(lookup).length > 0 ? lookup : undefined;
  }

  protected async resolveBeneficiaryVesting(client: VestingClient, options: VestingConfig): Promise<Address> {
    if (options.vesting) {
      return options.vesting as Address;
    }

    const beneficiary = await this.getSignerAddress();
    const vestings = await client.getBeneficiaryVestings(beneficiary, this.getFactoryLookupOptions(options));

    if (vestings.length === 0) {
      throw new Error(`No vesting contract found for beneficiary ${beneficiary}.`);
    }
    if (vestings.length > 1) {
      throw new Error(`Multiple vesting contracts found for beneficiary ${beneficiary}. Use --vesting <address>.`);
    }

    return vestings[0];
  }
}
