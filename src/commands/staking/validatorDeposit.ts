import {StakingAction, StakingConfig} from "./StakingAction";

export interface ValidatorDepositOptions extends StakingConfig {
  amount: string;
}

export class ValidatorDepositAction extends StakingAction {
  constructor() {
    super();
  }

  async execute(options: ValidatorDepositOptions): Promise<void> {
    this.startSpinner("Making validator deposit...");

    try {
      const client = await this.getStakingClient(options);
      const amount = this.parseAmount(options.amount);

      this.setSpinnerText(`Depositing ${this.formatAmount(amount)} to validator stake...`);

      const result = await client.validatorDeposit({amount});

      const output = {
        transactionHash: result.transactionHash,
        amount: this.formatAmount(amount),
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
      };

      this.succeedSpinner("Deposit successful!", output);
    } catch (error: any) {
      this.failSpinner("Failed to make deposit", error.message || error);
    }
  }
}
