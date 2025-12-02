import {StakingAction, StakingConfig} from "./StakingAction";
import type {Address} from "genlayer-js/types";

export interface ValidatorClaimOptions extends StakingConfig {
  validator?: string;
}

export class ValidatorClaimAction extends StakingAction {
  constructor() {
    super();
  }

  async execute(options: ValidatorClaimOptions): Promise<void> {
    this.startSpinner("Claiming validator withdrawals...");

    try {
      const client = await this.getStakingClient(options);
      const validatorAddress = options.validator || (await this.getSignerAddress());

      this.setSpinnerText(`Claiming for validator ${validatorAddress}...`);

      const result = await client.validatorClaim({
        validator: validatorAddress as Address,
      });

      const output = {
        transactionHash: result.transactionHash,
        validator: validatorAddress,
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
      };

      this.succeedSpinner("Claim successful!", output);
    } catch (error: any) {
      this.failSpinner("Failed to claim", error.message || error);
    }
  }
}
