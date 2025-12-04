import {BaseAction} from "../../lib/actions/BaseAction";

export class UseAccountAction extends BaseAction {
  constructor() {
    super();
  }

  async execute(name: string): Promise<void> {
    try {
      if (!this.accountExists(name)) {
        this.failSpinner(`Account '${name}' does not exist. Run 'genlayer account list' to see available accounts.`);
        return;
      }

      this.setActiveAccount(name);
      this.logSuccess(`Active account set to '${name}'`);
    } catch (error) {
      this.failSpinner("Failed to set active account", error);
    }
  }
}
