import {BaseAction} from "../../lib/actions/BaseAction";

export class RemoveAccountAction extends BaseAction {
  constructor() {
    super();
  }

  async execute(name: string, options: {force?: boolean}): Promise<void> {
    try {
      if (!this.accountExists(name)) {
        this.failSpinner(`Account '${name}' does not exist.`);
        return;
      }

      if (!options.force) {
        await this.confirmPrompt(`Are you sure you want to remove account '${name}'? This cannot be undone.`);
      }

      // Remove from keychain if unlocked
      await this.keychainManager.removePrivateKey(name);

      // Remove keystore file
      this.removeAccount(name);

      this.logSuccess(`Account '${name}' removed`);
    } catch (error) {
      this.failSpinner("Failed to remove account", error);
    }
  }
}
