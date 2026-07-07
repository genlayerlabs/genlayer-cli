import {VestingAction, VestingConfig} from "./VestingAction";
import type {Address} from "genlayer-js/types";

export interface VestingValidatorDepositOptions extends VestingConfig {
  wallet: string;
  amount: string;
}

export class VestingValidatorDepositAction extends VestingAction {
  constructor() {
    super();
  }

  async execute(options: VestingValidatorDepositOptions): Promise<void> {
    this.startSpinner("Depositing vesting tokens to validator...");

    try {
      const client = await this.getVestingClient(options);
      const amount = this.parseAmount(options.amount);
      const vesting = await this.resolveBeneficiaryVesting(client, options);

      this.setSpinnerText(`Depositing ${this.formatAmount(amount)} from vesting ${vesting} to wallet ${options.wallet}...`);

      const result = await client.vestingValidatorDeposit({
        vesting,
        wallet: options.wallet as Address,
        amount,
      });

      const output = {
        transactionHash: result.transactionHash,
        vesting,
        wallet: options.wallet,
        amount: this.formatAmount(amount),
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
      };

      this.succeedSpinner("Vesting validator deposit successful!", output);
    } catch (error: any) {
      this.failSpinner("Failed to deposit vesting validator tokens", error.message || error);
    }
  }
}
