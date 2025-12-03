import {StakingAction, StakingConfig} from "./StakingAction";
import type {Address} from "genlayer-js/types";

export interface DelegatorJoinOptions extends StakingConfig {
  validator: string;
  amount: string;
}

export class DelegatorJoinAction extends StakingAction {
  constructor() {
    super();
  }

  async execute(options: DelegatorJoinOptions): Promise<void> {
    this.startSpinner("Joining as delegator...");

    try {
      const client = await this.getStakingClient(options);
      const amount = this.parseAmount(options.amount);

      this.setSpinnerText(`Delegating ${this.formatAmount(amount)} to validator ${options.validator}...`);

      const result = await client.delegatorJoin({
        validator: options.validator as Address,
        amount,
      });

      const output = {
        transactionHash: result.transactionHash,
        validator: result.validator,
        amount: result.amount,
        delegator: result.delegator,
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
      };

      this.succeedSpinner("Successfully joined as delegator!", output);
    } catch (error: any) {
      this.failSpinner("Failed to join as delegator", error.message || error);
    }
  }
}
