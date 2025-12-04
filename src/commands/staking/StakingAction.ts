import {BaseAction, BUILT_IN_NETWORKS, resolveNetwork} from "../../lib/actions/BaseAction";
import {createClient, createAccount, formatStakingAmount, parseStakingAmount, abi} from "genlayer-js";
import type {GenLayerClient, GenLayerChain, Address} from "genlayer-js/types";
import {readFileSync, existsSync} from "fs";
import {ethers} from "ethers";

// Re-export for use by other staking commands
export {BUILT_IN_NETWORKS};

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
    const addr = keystoreData.address as string;
    const normalizedAddress = (addr.startsWith("0x") ? addr : `0x${addr}`) as Address;

    return createClient({
      chain: network,
      endpoint: config.rpc,
      account: normalizedAddress,
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
      // Verify cached key matches keystore address - safety check
      const tempAccount = createAccount(cachedKey as `0x${string}`);
      const cachedAddress = tempAccount.address.toLowerCase();
      const keystoreAddress = `0x${keystoreData.address.toLowerCase().replace(/^0x/, '')}`;

      if (cachedAddress !== keystoreAddress) {
        // Cached key doesn't match keystore - invalidate it
        await this.keychainManager.removePrivateKey(accountName);
        // Fall through to prompt for password
      } else {
        return cachedKey;
      }
    }

    // Stop spinner before prompting for password
    this.stopSpinner();
    const password = await this.promptPassword(`Enter password to unlock account '${accountName}':`);
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
    const addr = keystoreData.address as string;
    return (addr.startsWith("0x") ? addr : `0x${addr}`) as Address;
  }
}
