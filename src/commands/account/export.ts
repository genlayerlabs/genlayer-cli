import {BaseAction} from "../../lib/actions/BaseAction";
import {ethers} from "ethers";
import {writeFileSync, existsSync, readFileSync} from "fs";
import path from "path";

export interface ExportAccountOptions {
  account?: string;
  output: string;
  password?: string;
  sourcePassword?: string;
}

export class ExportAccountAction extends BaseAction {
  constructor() {
    super();
  }

  async execute(options: ExportAccountOptions): Promise<void> {
    try {
      if (options.account) {
        this.accountOverride = options.account;
      }

      const accountName = this.resolveAccountName();
      const keystorePath = this.getKeystorePath(accountName);

      if (!existsSync(keystorePath)) {
        this.failSpinner(`Account '${accountName}' not found.`);
      }

      const outputPath = path.resolve(options.output);

      if (existsSync(outputPath)) {
        this.failSpinner(`Output file already exists: ${outputPath}`);
      }

      // Get the private key
      const privateKey = await this.getPrivateKeyForExport(accountName, keystorePath, options.sourcePassword);

      // Get password for the exported keystore
      let password: string;
      if (options.password) {
        password = options.password;
      } else {
        password = await this.promptPassword("Enter password for exported keystore (minimum 8 characters):");
        const confirmPassword = await this.promptPassword("Confirm password:");
        if (password !== confirmPassword) {
          this.failSpinner("Passwords do not match");
        }
      }

      if (password.length < BaseAction.MIN_PASSWORD_LENGTH) {
        this.failSpinner(`Password must be at least ${BaseAction.MIN_PASSWORD_LENGTH} characters long`);
      }

      this.startSpinner(`Exporting account '${accountName}'...`);

      const wallet = new ethers.Wallet(privateKey);
      const encryptedJson = await wallet.encrypt(password);

      // Write standard web3 keystore format (compatible with geth, foundry, etc.)
      writeFileSync(outputPath, encryptedJson);

      this.succeedSpinner(`Account '${accountName}' exported to: ${outputPath}`);
      this.logInfo(`Address: ${wallet.address}`);
    } catch (error) {
      this.failSpinner("Failed to export account", error);
    }
  }

  private async getPrivateKeyForExport(
    accountName: string,
    keystorePath: string,
    sourcePassword?: string
  ): Promise<string> {
    // First check if key is cached in keychain
    const isAvailable = await this.keychainManager.isKeychainAvailable();
    if (isAvailable) {
      const cachedKey = await this.keychainManager.getPrivateKey(accountName);
      if (cachedKey) {
        return cachedKey;
      }
    }

    // Need to decrypt the keystore
    const fileContent = readFileSync(keystorePath, "utf-8");
    const parsed = JSON.parse(fileContent);

    const encryptedJson = parsed.encrypted || fileContent;

    const password = sourcePassword || await this.promptPassword(`Enter password to decrypt '${accountName}':`);

    this.startSpinner("Decrypting keystore...");

    try {
      const wallet = await ethers.Wallet.fromEncryptedJson(encryptedJson, password);
      this.stopSpinner();
      return wallet.privateKey;
    } catch {
      this.failSpinner("Failed to decrypt keystore. Wrong password?");
    }

    throw new Error("Unreachable");
  }
}
