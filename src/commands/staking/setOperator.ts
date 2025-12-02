import {StakingAction, StakingConfig} from "./StakingAction";
import type {Address} from "genlayer-js/types";

export interface SetOperatorOptions extends StakingConfig {
  validator: string;
  operator: string;
}

export class SetOperatorAction extends StakingAction {
  constructor() {
    super();
  }

  async execute(options: SetOperatorOptions): Promise<void> {
    this.startSpinner("Setting operator...");

    try {
      const client = await this.getStakingClient(options);

      this.setSpinnerText(`Setting operator to ${options.operator}...`);

      const result = await client.setOperator({
        validator: options.validator as Address,
        operator: options.operator as Address,
      });

      const output = {
        transactionHash: result.transactionHash,
        validator: options.validator,
        newOperator: options.operator,
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
      };

      this.succeedSpinner("Operator updated!", output);
    } catch (error: any) {
      this.failSpinner("Failed to set operator", error.message || error);
    }
  }
}
