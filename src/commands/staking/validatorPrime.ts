import {StakingAction, StakingConfig} from "./StakingAction";
import type {Address} from "genlayer-js/types";

export interface ValidatorPrimeOptions extends StakingConfig {
  validator: string;
}

export class ValidatorPrimeAction extends StakingAction {
  constructor() {
    super();
  }

  async execute(options: ValidatorPrimeOptions): Promise<void> {
    this.startSpinner("Priming validator...");

    try {
      const client = await this.getStakingClient(options);

      this.setSpinnerText(`Priming validator ${options.validator}...`);

      const result = await client.validatorPrime({validator: options.validator as Address});

      const output = {
        transactionHash: result.transactionHash,
        validator: options.validator,
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
      };

      this.succeedSpinner("Validator primed for next epoch!", output);
    } catch (error: any) {
      this.failSpinner("Failed to prime validator", error.message || error);
    }
  }
}
