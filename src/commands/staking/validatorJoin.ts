import {StakingAction, StakingConfig} from "./StakingAction";
import type {Address} from "genlayer-js/types";

export interface ValidatorJoinOptions extends StakingConfig {
  amount: string;
  operator?: string;
}

export class ValidatorJoinAction extends StakingAction {
  constructor() {
    super();
  }

  async execute(options: ValidatorJoinOptions): Promise<void> {
    this.startSpinner("Creating a new validator...");

    try {
      const client = await this.getStakingClient(options);
      const amount = this.parseAmount(options.amount);
      const signerAddress = await this.getSignerAddress();

      this.setSpinnerText(`Creating validator with ${this.formatAmount(amount)} stake...`);
      this.log(`  From: ${signerAddress}`);
      if (options.operator) {
        this.log(`  Operator: ${options.operator}`);
      }

      const result = await client.validatorJoin({
        amount,
        operator: options.operator as Address | undefined,
      });

      const output = {
        transactionHash: result.transactionHash,
        validatorWallet: result.validatorWallet,
        amount: result.amount,
        operator: result.operator,
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
      };

      this.succeedSpinner("Validator created successfully!", output);
    } catch (error: any) {
      this.failSpinner("Failed to create validator", error.message || error);
    }
  }
}
