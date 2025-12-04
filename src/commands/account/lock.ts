import {BaseAction} from "../../lib/actions/BaseAction";

export interface LockAccountOptions {
  account?: string;
}

export class LockAccountAction extends BaseAction {
  async execute(options?: LockAccountOptions): Promise<void> {
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
    this.setSpinnerText(`Checking for cached private key for '${accountName}'...`);

    const hasCachedKey = await this.keychainManager.getPrivateKey(accountName);
    if (!hasCachedKey) {
      this.succeedSpinner(`Account '${accountName}' is already locked.`);
      return;
    }

    this.setSpinnerText(`Removing private key for '${accountName}' from OS keychain...`);

    try {
      await this.keychainManager.removePrivateKey(accountName);
      this.succeedSpinner(`Account '${accountName}' locked! Private key removed from OS keychain.`);
    } catch (error) {
      this.failSpinner("Failed to lock account.", error);
    }
  }
}
