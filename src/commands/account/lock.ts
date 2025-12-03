import {BaseAction} from "../../lib/actions/BaseAction";

export class LockAccountAction extends BaseAction {
  async execute(): Promise<void> {
    this.startSpinner("Checking keychain availability...");

    const keychainAvailable = await this.keychainManager.isKeychainAvailable();
    if (!keychainAvailable) {
      this.failSpinner("OS keychain is not available. This command requires a supported keychain (e.g. macOS Keychain, Windows Credential Manager, or GNOME Keyring).");
      return;
    }

    this.setSpinnerText("Checking for cached private key...");

    const hasCachedKey = await this.keychainManager.getPrivateKey();
    if (!hasCachedKey) {
      this.succeedSpinner("Account is already locked.");
      return;
    }

    this.setSpinnerText("Removing private key from OS keychain...");

    try {
      await this.keychainManager.removePrivateKey();
      this.succeedSpinner("Account locked! Private key removed from OS keychain.");
    } catch (error) {
      this.failSpinner("Failed to lock account.", error);
    }
  }
}
