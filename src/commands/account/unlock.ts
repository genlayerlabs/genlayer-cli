import {BaseAction} from "../../lib/actions/BaseAction";
import {readFileSync, existsSync} from "fs";
import {ethers} from "ethers";

export class UnlockAccountAction extends BaseAction {
  async execute(): Promise<void> {
    this.startSpinner("Checking keychain availability...");

    const keychainAvailable = await this.keychainManager.isKeychainAvailable();
    if (!keychainAvailable) {
      this.failSpinner("OS keychain is not available. This command requires a supported keychain (e.g. macOS Keychain, Windows Credential Manager, or GNOME Keyring).");
      return;
    }

    this.setSpinnerText("Checking for existing account...");

    const keypairPath = this.getConfigByKey("keyPairPath");
    if (!keypairPath || !existsSync(keypairPath)) {
      this.failSpinner("No account found. Run 'genlayer account create' first.");
      return;
    }

    const keystoreData = JSON.parse(readFileSync(keypairPath, "utf-8"));
    if (!this.isValidKeystoreFormat(keystoreData)) {
      this.failSpinner("Invalid keystore format.");
      return;
    }

    this.stopSpinner();

    try {
      const password = await this.promptPassword("Enter password to unlock account:");
      const wallet = await ethers.Wallet.fromEncryptedJson(keystoreData.encrypted, password);

      await this.keychainManager.storePrivateKey(wallet.privateKey);
      this.succeedSpinner("Account unlocked! Private key cached in OS keychain.");
    } catch (error) {
      this.failSpinner("Failed to unlock account.", error);
    }
  }
}
