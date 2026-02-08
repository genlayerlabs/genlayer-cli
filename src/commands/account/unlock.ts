import {BaseAction} from "../../lib/actions/BaseAction";
import {readFileSync, existsSync} from "fs";
import {ethers} from "ethers";

export interface UnlockAccountOptions {
  account?: string;
  password?: string;
}

export class UnlockAccountAction extends BaseAction {
  async execute(options?: UnlockAccountOptions): Promise<void> {
    this.startSpinner("Checking keychain availability...");

    const keychainAvailable = await this.keychainManager.isKeychainAvailable();
    if (!keychainAvailable) {
      this.failSpinner("OS keychain is not available. This command requires a supported keychain (e.g. macOS Keychain, Windows Credential Manager, or GNOME Keyring).");
      return;
    }

    if (options?.account) {
      this.accountOverride = options.account;
    }

    const accountName = this.resolveAccountName();
    this.setSpinnerText(`Checking for account '${accountName}'...`);

    const keystorePath = this.getKeystorePath(accountName);
    if (!existsSync(keystorePath)) {
      this.failSpinner(`Account '${accountName}' not found. Run 'genlayer account create --name ${accountName}' first.`);
      return;
    }

    const keystoreJson = readFileSync(keystorePath, "utf-8");
    const keystoreData = JSON.parse(keystoreJson);
    if (!this.isValidKeystoreFormat(keystoreData)) {
      this.failSpinner("Invalid keystore format.");
      return;
    }

    try {
      let password: string;
      if (options?.password) {
        password = options.password;
      } else {
        this.stopSpinner();
        password = await this.promptPassword(`Enter password to unlock '${accountName}':`);
      }
      const wallet = await ethers.Wallet.fromEncryptedJson(keystoreJson, password);

      await this.keychainManager.storePrivateKey(accountName, wallet.privateKey);
      this.succeedSpinner(`Account '${accountName}' unlocked! Private key cached in OS keychain.`);
    } catch (error) {
      this.failSpinner("Failed to unlock account.", error);
    }
  }
}
