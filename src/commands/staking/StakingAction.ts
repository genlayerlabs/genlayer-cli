import {BaseAction, BUILT_IN_NETWORKS, resolveNetwork} from "../../lib/actions/BaseAction";
import {createClient, createAccount, formatStakingAmount, parseStakingAmount, abi} from "genlayer-js";
import type {GenLayerClient, GenLayerChain, Address} from "genlayer-js/types";
import {readFileSync, existsSync} from "fs";
import {ethers, ZeroAddress} from "ethers";
import {
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  type WalletClient,
  type Chain,
  type Account,
  type HttpTransportConfig,
  type TransactionReceipt,
} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {BrowserWalletBridge, type BridgeChainParams} from "../../lib/wallet/browserBridge";

// GenLayer RPC rejects JSON-RPC requests with id=0 (treats 0 as missing).
// Viem starts its id counter at 0, so we ensure non-zero ids.
const glHttpConfig: HttpTransportConfig = {
  async fetchFn(url, init) {
    if (init?.body) {
      const body = JSON.parse(init.body as string);
      if (body.id === 0) body.id = 1;
      init = {...init, body: JSON.stringify(body)};
    }
    return fetch(url, init);
  },
};

// Extended ABI for tree traversal (not in SDK)
const STAKING_TREE_ABI = [
  {
    name: "validatorsRoot",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{name: "", type: "address"}],
  },
] as const;

// Re-export for use by other staking commands
export {BUILT_IN_NETWORKS};

export interface StakingConfig {
  rpc?: string;
  stakingAddress?: string;
  network?: string;
  account?: string;
  password?: string;
  wallet?: "keystore" | "browser";
}

export interface BrowserWalletSession {
  bridge: BrowserWalletBridge;
  publicClient: PublicClient;
  chain: GenLayerChain;
  stakingAddress: string;
  signerAddress: Address;
  /** Preflight (publicClient.call) + queue to the wallet + await the receipt. */
  sendTransaction(tx: {
    to: Address;
    data: `0x${string}`;
    value?: bigint;
    label: string;
  }): Promise<TransactionReceipt>;
}

export class StakingAction extends BaseAction {
  private _stakingClient: GenLayerClient<GenLayerChain> | null = null;
  private _passwordOverride: string | undefined;

  constructor() {
    super();
  }

  private getNetwork(config: StakingConfig): GenLayerChain {
    // Priority: --network option > global config > localnet default
    if (config.network) {
      return {...resolveNetwork(config.network, this.getCustomNetworks())};
    }

    return resolveNetwork(this.getConfig().network, this.getCustomNetworks());
  }

  protected isBrowserWallet(config: StakingConfig): boolean {
    return config.wallet === "browser";
  }

  /**
   * Validate flag combinations for browser-wallet mode. Kept here (not in
   * commander) so it is reusable and unit-testable. `context` scopes the
   * `--account` message ("validator-join" vs "wizard").
   */
  protected assertBrowserWalletFlags(config: StakingConfig, context: "validator-join" | "wizard"): void {
    if (!this.isBrowserWallet(config)) {
      if (config.wallet !== undefined && config.wallet !== "keystore") {
        throw new Error(`Invalid --wallet value '${config.wallet}'. Use 'keystore' or 'browser'.`);
      }
      return;
    }

    if (config.password !== undefined) {
      throw new Error("--password cannot be used with --wallet browser");
    }
    if (config.account !== undefined) {
      if (context === "validator-join") {
        throw new Error("--account selects a keystore; not applicable with --wallet browser");
      }
      throw new Error("--account cannot be used with --wallet browser (the browser wallet is the owner)");
    }
  }

  /**
   * Build a browser-wallet signing session: starts the localhost bridge, opens
   * the wallet page, waits for connect, and returns a sendTransaction() that
   * preflights (publicClient.call), queues the tx to the wallet, and awaits the
   * receipt. Never touches keystore/keychain/password code paths.
   */
  protected async getBrowserWalletSession(
    config: StakingConfig,
    context: "validator-join" | "wizard",
  ): Promise<BrowserWalletSession> {
    this.assertBrowserWalletFlags(config, context);

    const chain = this.getNetwork(config);
    const rpcUrl = config.rpc || chain.rpcUrls.default.http[0];
    const stakingAddress = config.stakingAddress || chain.stakingContract?.address;

    if (!stakingAddress) {
      throw new Error(
        "Staking contract address not configured. Pass --staking-address or use a network with one.",
      );
    }

    const bridgeChain: BridgeChainParams = {
      chainId: chain.id,
      chainName: chain.name,
      rpcUrls: [rpcUrl],
      nativeCurrency: chain.nativeCurrency
        ? {
            name: chain.nativeCurrency.name,
            symbol: chain.nativeCurrency.symbol,
            decimals: chain.nativeCurrency.decimals,
          }
        : {name: "GEN Token", symbol: "GEN", decimals: 18},
      blockExplorerUrls: chain.blockExplorers?.default?.url ? [chain.blockExplorers.default.url] : undefined,
    };

    const publicClient = createPublicClient({
      chain: chain as unknown as Chain,
      transport: http(rpcUrl, glHttpConfig),
    });

    const bridge = new BrowserWalletBridge({
      chain: bridgeChain,
      log: (msg: string) => this.log(msg),
    });

    const {url} = await bridge.start();
    this.logInfo(`Open this URL in a browser with your wallet to sign:\n  ${url}`);
    this.logInfo("(Remote/SSH? Forward the port first: ssh -L <port>:127.0.0.1:<port> ...)");

    const signerAddress = await bridge.waitForConnection();

    const sendTransaction = async (tx: {
      to: Address;
      data: `0x${string}`;
      value?: bigint;
      label: string;
    }): Promise<TransactionReceipt> => {
      // Preflight to surface reverts before the wallet ever prompts.
      try {
        await publicClient.call({
          account: signerAddress,
          to: tx.to,
          data: tx.data,
          value: tx.value,
        });
      } catch (error: any) {
        await bridge.close("The CLI aborted: the transaction would revert.");
        throw new Error(
          `Transaction would revert (preflight): ${error.shortMessage || error.message || error}`,
        );
      }

      const hash = await bridge.sendTransaction({
        to: tx.to,
        data: tx.data,
        value: tx.value,
        label: tx.label,
      });

      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        timeout: 300_000,
      });

      if (receipt.status === "reverted") {
        const explorer = bridgeChain.blockExplorerUrls?.[0];
        const hint = explorer ? ` See ${explorer.replace(/\/$/, "")}/tx/${hash}` : "";
        throw new Error(`Transaction ${hash} reverted.${hint}`);
      }

      return receipt;
    };

    return {bridge, publicClient, chain, stakingAddress, signerAddress, sendTransaction};
  }

  protected async getStakingClient(config: StakingConfig): Promise<GenLayerClient<GenLayerChain>> {
    if (!this._stakingClient) {
      // Set account override if provided
      if (config.account) {
        this.accountOverride = config.account;
      }
      if (config.password) {
        this._passwordOverride = config.password;
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
      // Read-only queries don't need a local account: fall back to an
      // account-less client so listings work on a fresh install.
      return createClient({
        chain: network,
        endpoint: config.rpc,
      });
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
      throw new Error(
        `Account '${accountName}' not found. Run 'genlayer account create --name ${accountName}' first.`,
      );
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
      const keystoreAddress = `0x${keystoreData.address.toLowerCase().replace(/^0x/, "")}`;

      if (cachedAddress !== keystoreAddress) {
        // Cached key doesn't match keystore - invalidate it
        await this.keychainManager.removePrivateKey(accountName);
        // Fall through to prompt for password
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

  /**
   * Get viem clients for direct contract interactions (e.g., ValidatorWallet calls)
   * Future: can be extended to support hardware wallets
   */
  protected async getViemClients(config: StakingConfig): Promise<{
    walletClient: WalletClient<any, Chain, Account>;
    publicClient: PublicClient;
    signerAddress: Address;
  }> {
    if (config.account) {
      this.accountOverride = config.account;
    }
    if (config.password) {
      this._passwordOverride = config.password;
    }

    const network = this.getNetwork(config);
    const rpcUrl = config.rpc || network.rpcUrls.default.http[0];

    const privateKey = await this.getPrivateKeyForStaking();
    const account = privateKeyToAccount(privateKey as `0x${string}`);

    const publicClient = createPublicClient({
      chain: network,
      transport: http(rpcUrl, glHttpConfig),
    });

    const walletClient = createWalletClient({
      chain: network,
      transport: http(rpcUrl, glHttpConfig),
      account,
    });

    return {
      walletClient,
      publicClient,
      signerAddress: account.address as Address,
    };
  }

  /**
   * Get all validators by traversing the validator tree.
   * This finds ALL validators including those not yet active/primed.
   */
  protected async getAllValidatorsFromTree(config: StakingConfig): Promise<Address[]> {
    const network = this.getNetwork(config);
    const rpcUrl = config.rpc || network.rpcUrls.default.http[0];
    const stakingAddress = config.stakingAddress || network.stakingContract?.address;

    if (!stakingAddress) {
      throw new Error("Staking contract address not configured");
    }

    const publicClient = createPublicClient({
      chain: network,
      transport: http(rpcUrl, glHttpConfig),
    });

    // Get the root of the validator tree
    const root = await publicClient.readContract({
      address: stakingAddress as `0x${string}`,
      abi: STAKING_TREE_ABI,
      functionName: "validatorsRoot",
    });

    if (root === ZeroAddress) {
      return [];
    }

    const validators: Address[] = [];
    const stack: string[] = [root as string];
    const visited = new Set<string>();

    // Use validatorView from SDK's ABI (has left/right fields)
    while (stack.length > 0) {
      const addr = stack.pop()!;

      if (addr === ZeroAddress || visited.has(addr.toLowerCase())) continue;
      visited.add(addr.toLowerCase());

      validators.push(addr as Address);

      const info = (await publicClient.readContract({
        address: stakingAddress as `0x${string}`,
        abi: abi.STAKING_ABI,
        functionName: "validatorView",
        args: [addr as `0x${string}`],
      })) as {left: string; right: string};

      if (info.left !== ZeroAddress) {
        stack.push(info.left);
      }
      if (info.right !== ZeroAddress) {
        stack.push(info.right);
      }
    }

    return validators;
  }
}
