import {ConfigFileManager} from "../../lib/config/ConfigFileManager";
import {KeychainManager} from "../../lib/config/KeychainManager";
import ora, {Ora} from "ora";
import chalk from "chalk";
import inquirer from "inquirer";
import { inspect } from "util";
import {createClient, createAccount} from "genlayer-js";
import {localnet, studionet, testnetAsimov} from "genlayer-js/chains";
import type {GenLayerClient, GenLayerChain, Hash, Address, Account} from "genlayer-js/types";

// Built-in networks - always resolve fresh from genlayer-js
export const BUILT_IN_NETWORKS: Record<string, GenLayerChain> = {
  "localnet": localnet,
  "studionet": studionet,
  "testnet-asimov": testnetAsimov,
};

/**
 * Resolves a stored network config to a fresh chain object.
 * Handles both new format (alias string) and old format (JSON object) for backwards compat.
 */
export function resolveNetwork(stored: string | undefined): GenLayerChain {
  if (!stored) return localnet;

  // Try as alias first (new format)
  if (BUILT_IN_NETWORKS[stored]) {
    return BUILT_IN_NETWORKS[stored];
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

  constructor() {
    super();
    this.spinner = ora({text: "", spinner: "dots"});
    this.keychainManager = new KeychainManager();
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
      const network = resolveNetwork(this.getConfig().network);
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
    return keystoreData.address as Address;
  }

  protected async createKeypairByName(accountName: string, overwrite: boolean): Promise<string> {
    const keystorePath = this.getKeystorePath(accountName);
    this.stopSpinner();

    if (existsSync(keystorePath) && !overwrite) {
      this.failSpinner(`Account '${accountName}' already exists. Use '--overwrite' to replace it.`);
    }

    const wallet = ethers.Wallet.createRandom();

    const password = await this.promptPassword("Enter a password to encrypt your keystore (minimum 8 characters):");
    const confirmPassword = await this.promptPassword("Confirm password:");

    if (password !== confirmPassword) {
      this.failSpinner("Passwords do not match");
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