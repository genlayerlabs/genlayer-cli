import {BaseAction} from "../../lib/actions/BaseAction";

export interface CreateAccountOptions {
  output: string;
  overwrite: boolean;
}

export class CreateAccountAction extends BaseAction {
  constructor() {
    super();
  }

  async execute(options: CreateAccountOptions): Promise<void> {
    try {
      this.startSpinner("Creating encrypted keystore...");
      await this.createKeypair(options.output, options.overwrite);

      this.succeedSpinner(`Account created and saved to: ${options.output}`);
    } catch (error) {
      this.failSpinner("Failed to create account", error);
    }
  }
}
