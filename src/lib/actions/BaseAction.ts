import {ConfigFileManager} from "../../lib/config/ConfigFileManager";
import ora, {Ora} from "ora";
import chalk from "chalk";
import inquirer from "inquirer";
import { inspect } from "util";
import {createClient, createAccount} from "genlayer-js";
import {localnet} from "genlayer-js/chains";
import type {GenLayerClient, GenLayerChain} from "genlayer-js/types";
import { ethers } from "ethers";
import { writeFileSync, existsSync, readFileSync } from "fs";
import { KeystoreData } from "../interfaces/KeystoreData";

export class BaseAction extends ConfigFileManager {
  private spinner: Ora;
  private _genlayerClient: GenLayerClient<GenLayerChain> | null = null;

  constructor() {
    super();
    this.spinner = ora({text: "", spinner: "dots"});
  }

  private async decryptKeystore(keystoreData: KeystoreData, attempt: number = 1): Promise<string> {
    try {
      const message = attempt === 1 
        ? "Enter password to decrypt keystore:" 
        : `Invalid password. Attempt ${attempt}/3 - Enter password to decrypt keystore:`;
      const password = await this.promptPassword(message);
      const wallet = await ethers.Wallet.fromEncryptedJson(keystoreData.encrypted, password);
      return wallet.privateKey;
    } catch (error) {
      if (attempt >= 3) {
        this.failSpinner("Maximum password attempts exceeded (3/3).");
        process.exit(1);
      }
      return await this.decryptKeystore(keystoreData, attempt + 1);
    }
  }

  private isValidKeystoreFormat(data: any): data is KeystoreData {
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

  protected async getClient(rpcUrl?: string): Promise<GenLayerClient<GenLayerChain>> {
    if (!this._genlayerClient) {
      const networkConfig = this.getConfig().network;
      const network = networkConfig ? JSON.parse(networkConfig) : localnet;
      this._genlayerClient = createClient({
        chain: network,
        endpoint: rpcUrl,
        account: createAccount((await this.getPrivateKey()) as any),
      });
    }
    return this._genlayerClient;
  }

  protected async getPrivateKey(): Promise<string> {
    const keypairPath = this.getConfigByKey("keyPairPath");

    if (!keypairPath || !existsSync(keypairPath)) {
      await this.confirmPrompt("Keypair file not found. Would you like to create a new keypair?");
      return await this.createKeypair("./keypair.json", false);
    }

    const keystoreData = JSON.parse(readFileSync(keypairPath, "utf-8"));

    if (!this.isValidKeystoreFormat(keystoreData)) {
      this.failSpinner("Invalid keystore format. Expected encrypted keystore file.");
      process.exit(1);
    }

    return await this.decryptKeystore(keystoreData);
  }

  protected async createKeypair(outputPath: string, overwrite: boolean): Promise<string> {
    const finalOutputPath = this.getFilePath(outputPath);
    this.stopSpinner();

    if (existsSync(finalOutputPath) && !overwrite) {
      this.failSpinner(`The file at ${finalOutputPath} already exists. Use the '--overwrite' option to replace it.`);
      process.exit(1);
    }

    const wallet = ethers.Wallet.createRandom();
    
    const password = await this.promptPassword("Enter password to encrypt your keystore:");
    const confirmPassword = await this.promptPassword("Confirm password:");

    if (password !== confirmPassword) {
      this.failSpinner("Passwords do not match");
      process.exit(1);
    }

    if (password.length < 8) {
      this.failSpinner("Password must be at least 8 characters long");
      process.exit(1);
    }

    const encryptedJson = await wallet.encrypt(password);
    
    const keystoreData: KeystoreData = {
      version: 1,
      encrypted: encryptedJson,
      address: wallet.address,
    };

    writeFileSync(finalOutputPath, JSON.stringify(keystoreData, null, 2));
    this.writeConfig('keyPairPath', finalOutputPath);
    
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

  protected failSpinner(message: string, error?:any): void {
    if (error) this.log("Error:", error);
    console.log('');
    this.spinner.fail(chalk.red(message));
  }

  protected stopSpinner(): void {
    this.spinner.stop();
  }

  protected setSpinnerText(message: string): void {
    this.spinner.text = chalk.blue(message);
  }
}