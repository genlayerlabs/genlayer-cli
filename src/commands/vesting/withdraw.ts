import {VestingAction, VestingConfig} from "./VestingAction";

export interface VestingWithdrawOptions extends VestingConfig {
  amount: string;
}

export class VestingWithdrawAction extends VestingAction {
  constructor() {
    super();
  }

  async execute(options: VestingWithdrawOptions): Promise<void> {
    this.startSpinner("Withdrawing vested tokens...");

    try {
      const client = await this.getVestingClient(options);
      const amount = this.parseAmount(options.amount);
      const vesting = await this.resolveBeneficiaryVesting(client, options);

      this.setSpinnerText(`Withdrawing ${this.formatAmount(amount)} from vesting ${vesting}...`);

      const result = await client.vestingWithdraw({
        vesting,
        amount,
      });

      const output = {
        transactionHash: result.transactionHash,
        vesting: result.vesting,
        beneficiary: result.beneficiary,
        amount: result.amount,
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
      };

      this.succeedSpinner("Vesting withdrawal successful!", output);
    } catch (error: any) {
      this.failSpinner("Failed to withdraw vested tokens", error.message || error);
    }
  }
}
