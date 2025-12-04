import {BaseAction} from "../../lib/actions/BaseAction";

export class ListAccountsAction extends BaseAction {
  constructor() {
    super();
  }

  async execute(): Promise<void> {
    try {
      const accounts = this.listAccounts();
      const activeAccount = this.getActiveAccount();
      const unlockedAccounts = await this.keychainManager.listUnlockedAccounts();

      if (accounts.length === 0) {
        this.logInfo("No accounts found. Run 'genlayer account create --name <name>' to create one.");
        return;
      }

      console.log("");
      for (const account of accounts) {
        const isActive = account.name === activeAccount;
        const isUnlocked = unlockedAccounts.includes(account.name);
        const marker = isActive ? "*" : " ";
        const status = isUnlocked ? "(unlocked)" : "";
        const activeLabel = isActive ? "(active)" : "";

        console.log(`${marker} ${account.name.padEnd(16)} ${account.address} ${activeLabel} ${status}`.trim());
      }
      console.log("");
    } catch (error) {
      this.failSpinner("Failed to list accounts", error);
    }
  }
}
