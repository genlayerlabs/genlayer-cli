import {BaseAction} from "../../lib/actions/BaseAction";

export interface CreateKeypairOptions {
  output: string;
  overwrite: boolean;
}

export class KeypairCreator extends BaseAction {
  constructor() {
    super();
  }

  async createKeypairAction(options: CreateKeypairOptions) {
    try {
      this.startSpinner(`Creating encrypted keystore...`);
      await this.createKeypair(options.output, options.overwrite);
      
      this.succeedSpinner(`Encrypted keystore successfully created and saved to: ${options.output}`);
    } catch (error) {
      this.failSpinner("Failed to generate keystore", error);
    }
  }
}
