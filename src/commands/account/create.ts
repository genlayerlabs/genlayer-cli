import {BaseAction} from "../../lib/actions/BaseAction";

export interface CreateAccountOptions {
  name: string;
  overwrite: boolean;
  setActive?: boolean;
}

export class CreateAccountAction extends BaseAction {
  constructor() {
    super();
  }

  async execute(options: CreateAccountOptions): Promise<void> {
    try {
      this.startSpinner(`Creating account '${options.name}'...`);
      await this.createKeypairByName(options.name, options.overwrite);

      if (options.setActive !== false) {
        this.setActiveAccount(options.name);
      }

      const keystorePath = this.getKeystorePath(options.name);
      this.succeedSpinner(`Account '${options.name}' created at: ${keystorePath}`);
    } catch (error) {
      this.failSpinner("Failed to create account", error);
    }
  }
}
