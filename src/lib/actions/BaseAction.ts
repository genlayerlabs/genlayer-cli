import {ConfigFileManager} from "../../lib/config/ConfigFileManager";
import {KeychainManager} from "../../lib/config/KeychainManager";
import ora, {Ora} from "ora";
import chalk from "chalk";
import inquirer from "inquirer";
import { inspect } from "util";
import {createClient, createAccount} from "genlayer-js";
import {localnet} from "genlayer-js/chains";
import type {GenLayerClient, GenLayerChain, Hash, Address, Account} from "genlayer-js/types";
import { ethers } from "ethers";
import { writeFileSync, existsSync, readFileSync } from "fs";
import { KeystoreData } from "../interfaces/KeystoreData";

export class BaseAction extends ConfigFileManager {
  private static readonly DEFAULT_KEYSTORE_PATH = "./keypair.json";
  private static readonly MAX_PASSWORD_ATTEMPTS = 3;
  private static readonly MIN_PASSWORD_LENGTH = 8;

  private spinner: Ora;
  private _genlayerClient: GenLayerClient<GenLayerChain> | null = null;
  protected keychainManager: KeychainManager;

  constructor() {
    super();
    this.spinner = ora({text: "", spinner: "dots"});
    this.keychainManager = new KeychainManager();
  }

  private async decryptKeystore(keystoreData: KeystoreData, attempt: number = 1): Promise<string> {
    try {
      const message = attempt === 1 
        ? "Enter password to decrypt keystore:" 
        : `Invalid password. Attempt ${attempt}/${BaseAction.MAX_PASSWORD_ATTEMPTS} - Enter password to decrypt keystore:`;
      const password = await this.promptPassword(message);
      const wallet = await ethers.Wallet.fromEncryptedJson(keystoreData.encrypted, password);
      
      return wallet.privateKey;
    } catch (error) {
      if (attempt >= BaseAction.MAX_PASSWORD_ATTEMPTS) {
        this.failSpinner(`Maximum password attempts exceeded (${BaseAction.MAX_PASSWORD_ATTEMPTS}/${BaseAction.MAX_PASSWORD_ATTEMPTS}).`);
      }
      return await this.decryptKeystore(keystoreData, attempt + 1);
    }
  }

  protected isValidKeystoreFormat(data: any): data is KeystoreData {
    return Boolean(
      data && 
      data.version === 1 && 
      typeof data.encrypted === "string" && 
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
      const networkConfig = this.getConfig().network;
      const network = networkConfig ? JSON.parse(networkConfig) : localnet;
      const account = await this.getAccount(readOnly);
      this._genlayerClient = createClient({
        chain: network,
        endpoint: rpcUrl,
        account: account,
      });
    }
    return this._genlayerClient;
  }

  private async getAccount(readOnly: boolean = false): Promise<Account | Address> {
    let keypairPath = this.getConfigByKey("keyPairPath");
    let decryptedPrivateKey;
    let keystoreData;

    if (!keypairPath || !existsSync(keypairPath)) {
      await this.confirmPrompt("Keypair file not found. Would you like to create a new keypair?");
      decryptedPrivateKey = await this.createKeypair(BaseAction.DEFAULT_KEYSTORE_PATH, false);
      keypairPath = this.getConfigByKey("keyPairPath")!;
    }

    keystoreData = JSON.parse(readFileSync(keypairPath, "utf-8"));

    if (!this.isValidKeystoreFormat(keystoreData)) {
      this.failSpinner("Invalid keystore format. Expected encrypted keystore file.", undefined, false);
      await this.confirmPrompt("Would you like to create a new keypair?");
      decryptedPrivateKey = await this.createKeypair(BaseAction.DEFAULT_KEYSTORE_PATH, true);
      keypairPath = this.getConfigByKey("keyPairPath")!;
      keystoreData = JSON.parse(readFileSync(keypairPath, "utf-8"));
    }

    if (readOnly) {
      return this.getAddress(keystoreData);
    }
    
    if (!decryptedPrivateKey) {
      const cachedKey = await this.keychainManager.getPrivateKey();
      decryptedPrivateKey = cachedKey ? cachedKey : await this.decryptKeystore(keystoreData);
    }
    return createAccount(decryptedPrivateKey as Hash);
  }

  private getAddress(keystoreData: KeystoreData): Address {
    return keystoreData.address as Address;
  }

  protected async createKeypair(outputPath: string, overwrite: boolean): Promise<string> {
    const finalOutputPath = this.getFilePath(outputPath);
    this.stopSpinner();

    if (existsSync(finalOutputPath) && !overwrite) {
      this.failSpinner(`The file at ${finalOutputPath} already exists. Use the '--overwrite' option to replace it.`);
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

    const encryptedJson = await wallet.encrypt(password);
    
    const keystoreData: KeystoreData = {
      version: 1,
      encrypted: encryptedJson,
      address: wallet.address,
    };

    writeFileSync(finalOutputPath, JSON.stringify(keystoreData, null, 2));
    this.writeConfig('keyPairPath', finalOutputPath);
    
    await this.keychainManager.removePrivateKey();
    
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