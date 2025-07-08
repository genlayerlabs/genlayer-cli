import {BaseAction} from "../../lib/actions/BaseAction";

export interface CreateKeypairOptions {
  output: string;
  overwrite: boolean;
}

export class KeypairCreator extends BaseAction {
  constructor() {
    super();
  }

  createKeypairAction(options: CreateKeypairOptions) {
    try {
      this.startSpinner(`Creating keypair...`);
      this.keypairManager.createKeypair(options.output, options.overwrite);
      this.succeedSpinner(`Keypair successfully created and saved to: ${options.output}`);
    } catch (error) {
      this.failSpinner("Failed to generate keypair", error);
    }
  }
}
