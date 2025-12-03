import {BaseAction} from "../../lib/actions/BaseAction";
import {ethers} from "ethers";
import {writeFileSync, existsSync} from "fs";
import {KeystoreData} from "../../lib/interfaces/KeystoreData";

export interface ImportAccountOptions {
  privateKey?: string;
  output: string;
  overwrite: boolean;
}

export class ImportAccountAction extends BaseAction {
  private static readonly MIN_PASSWORD_LENGTH = 8;

  constructor() {
    super();
  }

  async execute(options: ImportAccountOptions): Promise<void> {
    try {
      const privateKey = options.privateKey || await this.promptPrivateKey();

      const normalizedKey = this.normalizePrivateKey(privateKey);
      this.validatePrivateKey(normalizedKey);

      const finalOutputPath = this.getFilePath(options.output);

      if (existsSync(finalOutputPath) && !options.overwrite) {
        this.failSpinner(`File at ${finalOutputPath} already exists. Use '--overwrite' to replace.`);
      }

      const wallet = new ethers.Wallet(normalizedKey);

      const password = await this.promptPassword("Enter a password to encrypt your keystore (minimum 8 characters):");
      const confirmPassword = await this.promptPassword("Confirm password:");

      if (password !== confirmPassword) {
        this.failSpinner("Passwords do not match");
      }

      if (password.length < ImportAccountAction.MIN_PASSWORD_LENGTH) {
        this.failSpinner(`Password must be at least ${ImportAccountAction.MIN_PASSWORD_LENGTH} characters long`);
      }

      this.startSpinner("Encrypting and saving keystore...");

      const encryptedJson = await wallet.encrypt(password);

      const keystoreData: KeystoreData = {
        version: 1,
        encrypted: encryptedJson,
        address: wallet.address,
      };

      writeFileSync(finalOutputPath, JSON.stringify(keystoreData, null, 2));
      this.writeConfig("keyPairPath", finalOutputPath);

      await this.keychainManager.removePrivateKey();

      this.succeedSpinner(`Account imported and saved to: ${finalOutputPath}`);
      this.logInfo(`Address: ${wallet.address}`);
    } catch (error) {
      this.failSpinner("Failed to import account", error);
    }
  }

  private async promptPrivateKey(): Promise<string> {
    return this.promptPassword("Enter private key to import:");
  }

  private normalizePrivateKey(key: string): string {
    const trimmed = key.trim();
    return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
  }

  private validatePrivateKey(key: string): void {
    if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
      this.failSpinner("Invalid private key format. Expected 64 hex characters (with or without 0x prefix).");
    }
  }
}
