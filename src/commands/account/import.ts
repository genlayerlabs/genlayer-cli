import {BaseAction} from "../../lib/actions/BaseAction";
import {ethers} from "ethers";
import {writeFileSync, existsSync, readFileSync} from "fs";

export interface ImportAccountOptions {
  privateKey?: string;
  keystore?: string;
  name: string;
  overwrite: boolean;
  setActive?: boolean;
  password?: string;
  sourcePassword?: string;
}

export class ImportAccountAction extends BaseAction {
  constructor() {
    super();
  }

  async execute(options: ImportAccountOptions): Promise<void> {
    try {
      const keystorePath = this.getKeystorePath(options.name);

      if (existsSync(keystorePath) && !options.overwrite) {
        this.failSpinner(`Account '${options.name}' already exists. Use '--overwrite' to replace.`);
      }

      let privateKey: string;

      if (options.keystore) {
        privateKey = await this.importFromKeystore(options.keystore, options.sourcePassword);
      } else if (options.privateKey) {
        const normalizedKey = this.normalizePrivateKey(options.privateKey);
        this.validatePrivateKey(normalizedKey);
        privateKey = normalizedKey;
      } else {
        const inputKey = await this.promptPrivateKey();
        const normalizedKey = this.normalizePrivateKey(inputKey);
        this.validatePrivateKey(normalizedKey);
        privateKey = normalizedKey;
      }

      const wallet = new ethers.Wallet(privateKey);

      let password: string;
      if (options.password) {
        password = options.password;
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

      this.startSpinner(`Importing account '${options.name}'...`);

      const encryptedJson = await wallet.encrypt(password);

      // Write standard web3 keystore format directly
      writeFileSync(keystorePath, encryptedJson);

      if (options.setActive !== false) {
        this.setActiveAccount(options.name);
      }

      await this.keychainManager.removePrivateKey(options.name);

      this.succeedSpinner(`Account '${options.name}' imported to: ${keystorePath}`);
      this.logInfo(`Address: ${wallet.address}`);
    } catch (error) {
      this.failSpinner("Failed to import account", error);
    }
  }

  private async importFromKeystore(keystorePath: string, sourcePassword?: string): Promise<string> {
    if (!existsSync(keystorePath)) {
      this.failSpinner(`Keystore file not found: ${keystorePath}`);
    }

    const fileContent = readFileSync(keystorePath, "utf-8");
    let encryptedJson: string;

    try {
      const parsed = JSON.parse(fileContent);

      // Check if it's our format (with 'encrypted' field) or standard web3 keystore
      if (parsed.encrypted) {
        // Our format
        encryptedJson = parsed.encrypted;
      } else if (parsed.crypto || parsed.Crypto) {
        // Standard web3 keystore format (geth, foundry, etc.)
        encryptedJson = fileContent;
      } else {
        this.failSpinner("Invalid keystore format. Expected encrypted keystore file.");
      }
    } catch {
      this.failSpinner("Invalid keystore file. Could not parse JSON.");
    }

    const password = sourcePassword || await this.promptPassword("Enter password to decrypt keystore:");

    this.startSpinner("Decrypting keystore...");

    try {
      const wallet = await ethers.Wallet.fromEncryptedJson(encryptedJson!, password);
      this.stopSpinner();
      return wallet.privateKey;
    } catch {
      this.failSpinner("Failed to decrypt keystore. Wrong password?");
    }

    // This line is unreachable but TypeScript needs it
    throw new Error("Unreachable");
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
