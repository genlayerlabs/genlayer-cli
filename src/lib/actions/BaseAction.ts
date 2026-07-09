import {ConfigFileManager} from "../../lib/config/ConfigFileManager";
import {KeychainManager} from "../../lib/config/KeychainManager";
import ora, {Ora} from "ora";
import chalk from "chalk";
import inquirer from "inquirer";
import { inspect } from "util";
import {createClient, createAccount} from "genlayer-js";
import {localnet, studionet, testnetAsimov, testnetBradbury} from "genlayer-js/chains";
import type {GenLayerClient, GenLayerChain, Hash, Address, Account} from "genlayer-js/types";
import {
  applyCustomNetworkProfile,
  CUSTOM_NETWORKS_CONFIG_KEY,
  normalizeCustomNetworks,
  type CustomNetworksConfig,
} from "../networks/customNetworks";
import {type BrowserSession, type WalletMode} from "../wallet/browserSend";
import {resolveBrowserWalletSession, type SessionFallback} from "../wallet/sessionResolver";
import {descriptorPath, readDescriptor, isPidAlive} from "../wallet/sessionDescriptor";

// Built-in networks - always resolve fresh from genlayer-js
export const BUILT_IN_NETWORKS: Record<string, GenLayerChain> = {
  "localnet": localnet,
  "studionet": studionet,
  "testnet-asimov": testnetAsimov,
  "testnet-bradbury": testnetBradbury,
};

/**
 * Resolves a stored network config to a fresh chain object.
 * Handles both new format (alias string) and old format (JSON object) for backwards compat.
 */
export function resolveNetwork(stored: string | undefined, customNetworks?: CustomNetworksConfig): GenLayerChain {
  if (!stored) return localnet;

  // Try as alias first (new format)
  if (BUILT_IN_NETWORKS[stored]) {
    return BUILT_IN_NETWORKS[stored];
  }

  const customNetwork = customNetworks?.[stored];
  if (customNetwork) {
    const baseNetwork = BUILT_IN_NETWORKS[customNetwork.base];
    if (!baseNetwork) {
      throw new Error(`Custom network ${stored} references unknown base network: ${customNetwork.base}`);
    }
    return applyCustomNetworkProfile(baseNetwork, customNetwork);
  }

  // Backwards compat: try parsing as JSON (old format)
  try {
    const parsed = JSON.parse(stored);
    // If it has a known name, use fresh version instead
    const alias = Object.entries(BUILT_IN_NETWORKS)
      .find(([_, chain]) => chain.name === parsed.name)?.[0];
    if (alias) {
      return BUILT_IN_NETWORKS[alias];
    }
    // Custom network - use as-is
    return parsed;
  } catch {
    throw new Error(`Unknown network: ${stored}`);
  }
}
import { ethers } from "ethers";
import { writeFileSync, existsSync, readFileSync } from "fs";

export class BaseAction extends ConfigFileManager {
  private static readonly DEFAULT_ACCOUNT_NAME = "default";
  private static readonly MAX_PASSWORD_ATTEMPTS = 3;
  protected static readonly MIN_PASSWORD_LENGTH = 8;

  private spinner: Ora;
  private _genlayerClient: GenLayerClient<GenLayerChain> | null = null;
  protected keychainManager: KeychainManager;
  protected accountOverride: string | null = null;
  protected walletModeOverride: WalletMode | null = null;
  protected browserSession: BrowserSession | null = null;

  constructor() {
    super();
    this.spinner = ora({text: "", spinner: "dots"});
    this.keychainManager = new KeychainManager();
  }

  protected getCustomNetworks(): CustomNetworksConfig {
    return normalizeCustomNetworks(this.getConfigByKey(CUSTOM_NETWORKS_CONFIG_KEY));
  }

  // --- Browser-wallet (MetaMask) signing seam ------------------------------

  /**
   * Resolve the effective signing mode. Precedence: explicit --wallet flag >
   * config `walletMode` > a live wallet session > "keystore". An invalid flag
   * throws; an unknown config value warns and falls back to keystore.
   *
   * The live-session rung is what makes `genlayer wallet connect` alone enough:
   * once a session is up, bare commands default to browser signing without a
   * separate `config set walletMode browser`. Explicit `--wallet keystore` (or
   * `walletMode=keystore` in config) still overrides a live session, so opting
   * back out is one flag/config away.
   */
  protected resolveWalletMode(flag?: string): WalletMode {
    if (flag === "browser" || flag === "keystore") return flag;
    if (flag !== undefined) {
      throw new Error(`Invalid --wallet value '${flag}'. Use 'keystore' or 'browser'.`);
    }
    const cfg = this.getConfigByKey("walletMode");
    if (cfg === "browser") return "browser";
    if (cfg === "keystore") return "keystore"; // explicit opt-out wins over a live session
    if (cfg !== null && cfg !== undefined) {
      this.logWarning(`Ignoring invalid walletMode config value '${cfg}'. Using 'keystore'.`);
      return "keystore";
    }
    // No flag, no config: a live wallet session implies browser mode.
    if (this.hasLiveWalletSession()) return "browser";
    return "keystore";
  }

  /**
   * Cheap, synchronous "is a wallet session up?" gate: descriptor present and
   * its daemon pid still alive. This mirrors the pid rung of
   * resolveBrowserWalletSession — the authoritative /api/ping happens there when
   * the command actually runs, so a stale-but-pid-alive descriptor still gets
   * cleaned up and falls back correctly. Kept sync because resolveWalletMode
   * (and its callers) are sync. Never throws — a bad/locked descriptor file
   * just reads as "no session".
   */
  protected hasLiveWalletSession(): boolean {
    try {
      const descriptor = readDescriptor(descriptorPath(this));
      return descriptor !== null && isPidAlive(descriptor.pid);
    } catch {
      return false;
    }
  }

  protected isBrowserWallet(config: {wallet?: string}): boolean {
    return this.resolveWalletMode(config.wallet) === "browser";
  }

  /**
   * Validate flag combinations for browser-wallet mode. Kept here (not in
   * commander) so it is reusable and unit-testable. When browser: --password
   * always conflicts; --account conflicts where the command has it. The
   * invalid-value check now lives in resolveWalletMode.
   */
  protected assertWalletFlags(
    config: {wallet?: string; password?: string; account?: string},
    opts: {accountFlagExists: boolean; context: string},
  ): void {
    if (!this.isBrowserWallet(config)) {
      return;
    }
    if (config.password !== undefined) {
      throw new Error("--password cannot be used with --wallet browser");
    }
    if (opts.accountFlagExists && config.account !== undefined) {
      throw new Error("--account selects a keystore; not applicable with --wallet browser");
    }
  }

  /**
   * Open (or reuse) a browser-wallet session for the current process. Resolves
   * the chain, starts the bridge, prints the URL, and caches the session so
   * multi-tx flows share one browser tab. Never touches keystore code paths.
   */
  protected async getBrowserSession(
    opts: {network?: string; rpc?: string; fallback?: SessionFallback} = {},
  ): Promise<BrowserSession> {
    if (this.browserSession) return this.browserSession;

    const chain = opts.network
      ? {...resolveNetwork(opts.network, this.getCustomNetworks())}
      : resolveNetwork(this.getConfig().network, this.getCustomNetworks());
    const rpcUrl = opts.rpc || chain.rpcUrls.default.http[0];

    // Prefer a persistent daemon session (connect-once). No live session →
    // auto-start one and leave it up for subsequent commands.
    this.browserSession = await resolveBrowserWalletSession({
      chain,
      rpcUrl,
      networkAlias: opts.network ?? this.getConfig().network,
      configManager: this,
      fallback: opts.fallback ?? "auto-start",
      log: (msg: string) => this.log(msg),
      logInfo: (msg: string) => this.logInfo(msg),
      logWarning: (msg: string) => this.logWarning(msg),
    });
    return this.browserSession;
  }

  protected async closeBrowserSession(finalMessage?: string): Promise<void> {
    if (!this.browserSession) return;
    const session = this.browserSession;
    this.browserSession = null;
    await session.close(finalMessage);
  }

  private async decryptKeystore(keystoreJson: string, attempt: number = 1): Promise<string> {
    try {
      const message = attempt === 1
        ? "Enter password to decrypt keystore:"
        : `Invalid password. Attempt ${attempt}/${BaseAction.MAX_PASSWORD_ATTEMPTS} - Enter password to decrypt keystore:`;
      const password = await this.promptPassword(message);
      const wallet = await ethers.Wallet.fromEncryptedJson(keystoreJson, password);

      return wallet.privateKey;
    } catch (error) {
      if (attempt >= BaseAction.MAX_PASSWORD_ATTEMPTS) {
        this.failSpinner(`Maximum password attempts exceeded (${BaseAction.MAX_PASSWORD_ATTEMPTS}/${BaseAction.MAX_PASSWORD_ATTEMPTS}).`);
      }
      return await this.decryptKeystore(keystoreJson, attempt + 1);
    }
  }

  protected isValidKeystoreFormat(data: any): boolean {
    // Standard web3 keystore format has 'crypto' (or 'Crypto') and 'address' fields
    return Boolean(
      data &&
      (data.crypto || data.Crypto) &&
      typeof data.address === "string"
    );
  }

  private formatOutput(data: any): string {
    if (typeof data === "string") {
      return data;
    }
    return inspect(data, { depth: null, colors: false });
  }

  protected async getClient(rpcUrl?: string, readOnly: boolean = false): Promise<GenLayerClient<GenLayerChain>> {
    if (!this._genlayerClient) {
      const network = resolveNetwork(this.getConfig().network, this.getCustomNetworks());

      // Lane B (browser wallet): a plain Address account + EIP-1193 provider
      // routes eth_sendTransaction through the bridge. Skip getAccount() so no
      // keystore/keychain/password prompt is ever triggered.
      if (this.walletModeOverride === "browser") {
        const session = await this.getBrowserSession({rpc: rpcUrl});
        this._genlayerClient = createClient({
          chain: network,
          endpoint: rpcUrl,
          account: session.signerAddress,
          provider: session.eip1193Provider,
        } as Parameters<typeof createClient>[0]);
        return this._genlayerClient;
      }

      const account = await this.getAccount(readOnly);
      this._genlayerClient = createClient({
        chain: network,
        endpoint: rpcUrl,
        account: account,
      });
    }
    return this._genlayerClient;
  }

  protected resolveAccountName(): string {
    // Priority: explicit override > config active account > default
    if (this.accountOverride) {
      return this.accountOverride;
    }
    const activeAccount = this.getActiveAccount();
    if (activeAccount) {
      return activeAccount;
    }
    return BaseAction.DEFAULT_ACCOUNT_NAME;
  }

  private async getAccount(readOnly: boolean = false): Promise<Account | Address> {
    const accountName = this.resolveAccountName();
    const keystorePath = this.getKeystorePath(accountName);
    let decryptedPrivateKey;
    let keystoreJson: string;
    let keystoreData: any;

    if (!existsSync(keystorePath)) {
      await this.confirmPrompt(`Account '${accountName}' not found. Would you like to create it?`);
      decryptedPrivateKey = await this.createKeypairByName(accountName, false);
    }

    keystoreJson = readFileSync(keystorePath, "utf-8");
    keystoreData = JSON.parse(keystoreJson);

    if (!this.isValidKeystoreFormat(keystoreData)) {
      this.failSpinner("Invalid keystore format. Expected encrypted keystore file.", undefined, false);
      await this.confirmPrompt(`Would you like to recreate account '${accountName}'?`);
      decryptedPrivateKey = await this.createKeypairByName(accountName, true);
      keystoreJson = readFileSync(keystorePath, "utf-8");
      keystoreData = JSON.parse(keystoreJson);
    }

    if (readOnly) {
      return this.getAddress(keystoreData);
    }

    if (!decryptedPrivateKey) {
      const cachedKey = await this.keychainManager.getPrivateKey(accountName);
      if (cachedKey) {
        // Verify cached key matches keystore address
        const tempAccount = createAccount(cachedKey as Hash);
        const cachedAddress = tempAccount.address.toLowerCase();
        const keystoreAddress = `0x${keystoreData.address.toLowerCase().replace(/^0x/, '')}`;
        if (cachedAddress === keystoreAddress) {
          decryptedPrivateKey = cachedKey;
        } else {
          // Cached key doesn't match keystore - invalidate it
          await this.keychainManager.removePrivateKey(accountName);
          decryptedPrivateKey = await this.decryptKeystore(keystoreJson);
        }
      } else {
        decryptedPrivateKey = await this.decryptKeystore(keystoreJson);
      }
    }
    return createAccount(decryptedPrivateKey as Hash);
  }

  private getAddress(keystoreData: any): Address {
    const addr = keystoreData.address;
    return (addr.startsWith('0x') ? addr : `0x${addr}`) as Address;
  }

  protected async createKeypairByName(accountName: string, overwrite: boolean, passwordInput?: string): Promise<string> {
    const keystorePath = this.getKeystorePath(accountName);
    this.stopSpinner();

    if (existsSync(keystorePath) && !overwrite) {
      this.failSpinner(`Account '${accountName}' already exists. Use '--overwrite' to replace it.`);
    }

    const wallet = ethers.Wallet.createRandom();

    let password: string;
    if (passwordInput) {
      password = passwordInput;
    } else {
      password = await this.promptPassword("Enter a password to encrypt your keystore (minimum 8 characters):");
      const confirmPassword = await this.promptPassword("Confirm password:");
      if (password !== confirmPassword) {
        this.failSpinner("Passwords do not match");
      }
    }

    if (password.length < BaseAction.MIN_PASSWORD_LENGTH) {
      this.failSpinner(`Password must be at least ${BaseAction.MIN_PASSWORD_LENGTH} characters long`);
    }

    // Write standard web3 keystore format directly
    const encryptedJson = await wallet.encrypt(password);
    writeFileSync(keystorePath, encryptedJson);

    // Set as active account if no active account exists
    if (!this.getActiveAccount()) {
      this.setActiveAccount(accountName);
    }

    await this.keychainManager.removePrivateKey(accountName);

    return wallet.privateKey;
  }

  protected async promptPassword(message: string): Promise<string> {
    const answer = await inquirer.prompt([
      {
        type: "password",
        name: "password",
        message: chalk.yellow(message),
        mask: "*",
        validate: (input: string) => {
          if (!input) {
            return "Password cannot be empty";
          }
          return true;
        },
      },
    ]);
    return answer.password;
  }

  protected async confirmPrompt(message: string): Promise<void> {
    const answer = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirmAction",
        message: chalk.yellow(message),
        default: true,
      },
    ]);

    if (!answer.confirmAction) {
      this.logError("Operation aborted!");
      process.exit(0);
    }
  }

  protected log(message: string, data?: any): void {
    console.log(chalk.white(`\n${message}`));
    if (data !== undefined) console.log(this.formatOutput(data));
  }

  protected logSuccess(message: string, data?: any): void {
    console.log(chalk.green(`\n✔ ${message}`));
    if (data !== undefined) console.log(chalk.green(this.formatOutput(data)));
  }

  protected logInfo(message: string, data?: any): void {
    console.log(chalk.blue(`\nℹ ${message}`));
    if (data !== undefined) console.log(chalk.blue(this.formatOutput(data)));
  }

  protected logWarning(message: string, data?: any): void {
    console.log(chalk.yellow(`\n⚠ ${message}`));
    if (data !== undefined) console.log(chalk.yellow(this.formatOutput(data)));
  }

  protected logError(message: string, error?: any): void {
    console.error(chalk.red(`\n✖ ${message}`));
    if (error !== undefined) console.error(chalk.red(this.formatOutput(error)));
  }

  protected startSpinner(message: string) {
    this.spinner.text = chalk.blue(`${message}`);
    this.spinner.start();
  }

  protected succeedSpinner(message: string, data?: any): void {
    if (data !== undefined) this.log("Result:", data);
    console.log('');
    this.spinner.succeed(chalk.green(message));
  }

  protected failSpinner(message: string, error?: any, shouldExit = true): void {
    if (error) this.log("Error:", error);
    console.log("");
    this.spinner.fail(chalk.red(message));
    if (shouldExit) {
      process.exit(1);
    }
  }

  protected stopSpinner(): void {
    this.spinner.stop();
  }

  protected setSpinnerText(message: string): void {
    this.spinner.text = chalk.blue(message);
  }
}
