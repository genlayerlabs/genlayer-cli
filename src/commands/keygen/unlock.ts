import { BaseAction } from "../../lib/actions/BaseAction";
import { readFileSync, existsSync } from "fs";
import { ethers } from "ethers";

export class UnlockAction extends BaseAction {
  async execute(): Promise<void> {
    this.startSpinner("Checking keychain availability...");

    const keychainAvailable = await this.keychainManager.isKeychainAvailable();
    if (!keychainAvailable) {
      this.failSpinner("OS keychain is not available. This command requires a supported keychain (e.g. macOS Keychain, Windows Credential Manager, or GNOME Keyring).");
      return;
    }

    this.setSpinnerText("Checking for existing keystore...");

    const keypairPath = this.getConfigByKey("keyPairPath");
    if (!keypairPath || !existsSync(keypairPath)) {
      this.failSpinner("No keystore file found. Please create a keypair first using 'genlayer keygen create'.");
      return;
    }
    this.stopSpinner();

    try {
      const password = await this.promptPassword("Enter password to decrypt keystore:");
      const keystoreData = JSON.parse(readFileSync(keypairPath, "utf-8"));
      const wallet = await ethers.Wallet.fromEncryptedJson(keystoreData.encrypted, password);
      
      await this.keychainManager.storePrivateKey(wallet.privateKey);
      this.succeedSpinner("Wallet unlocked successfully! Your private key is now stored securely in the OS keychain.");
    } catch (error) {
      this.failSpinner("Failed to unlock wallet.", error);
    }
  }
} 