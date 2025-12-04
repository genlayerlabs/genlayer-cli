import {BaseAction, BUILT_IN_NETWORKS, resolveNetwork} from "../../lib/actions/BaseAction";
import {createClient, createAccount, formatStakingAmount, parseStakingAmount, abi} from "genlayer-js";
import type {GenLayerClient, GenLayerChain, Address} from "genlayer-js/types";
import {readFileSync, existsSync} from "fs";
import {ethers} from "ethers";

export interface StakingConfig {
  rpc?: string;
  stakingAddress?: string;
  network?: string;
  account?: string;
}

export class StakingAction extends BaseAction {
  private _stakingClient: GenLayerClient<GenLayerChain> | null = null;

  constructor() {
    super();
  }

  private getNetwork(config: StakingConfig): GenLayerChain {
    // Priority: --network option > global config > localnet default
    if (config.network) {
      const network = BUILT_IN_NETWORKS[config.network];
      if (!network) {
        throw new Error(`Unknown network: ${config.network}. Available: ${Object.keys(BUILT_IN_NETWORKS).join(", ")}`);
      }
      return {...network};
    }

    return resolveNetwork(this.getConfig().network);
  }

  protected async getStakingClient(config: StakingConfig): Promise<GenLayerClient<GenLayerChain>> {
    if (!this._stakingClient) {
      // Set account override if provided
      if (config.account) {
        this.accountOverride = config.account;
      }

      const network = this.getNetwork(config);

      // Override staking address if provided
      if (config.stakingAddress) {
        network.stakingContract = {
          address: config.stakingAddress,
          abi: abi.STAKING_ABI,
        };
      }

      const privateKey = await this.getPrivateKeyForStaking();
      const account = createAccount(privateKey as `0x${string}`);

      this._stakingClient = createClient({
        chain: network,
        endpoint: config.rpc,
        account,
      });
    }
    return this._stakingClient;
  }

  protected async getReadOnlyStakingClient(config: StakingConfig): Promise<GenLayerClient<GenLayerChain>> {
    // Set account override if provided
    if (config.account) {
      this.accountOverride = config.account;
    }

    const network = this.getNetwork(config);

    if (config.stakingAddress) {
      network.stakingContract = {
        address: config.stakingAddress,
        abi: abi.STAKING_ABI,
      };
    }

    const accountName = this.resolveAccountName();
    const keystorePath = this.getKeystorePath(accountName);

    if (!existsSync(keystorePath)) {
      throw new Error(`Account '${accountName}' not found. Run 'genlayer account create --name ${accountName}' first.`);
    }

    const keystoreData = JSON.parse(readFileSync(keystorePath, "utf-8"));

    return createClient({
      chain: network,
      endpoint: config.rpc,
      account: keystoreData.address as Address,
    });
  }

  private async getPrivateKeyForStaking(): Promise<string> {
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
      return cachedKey;
    }

    // Stop spinner before prompting for password
    this.stopSpinner();
    const password = await this.promptPassword(`Enter password for '${accountName}':`);
    this.startSpinner("Continuing...");

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
    return keystoreData.address as Address;
  }
}
