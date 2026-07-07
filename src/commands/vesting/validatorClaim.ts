import {VestingAction, VestingConfig} from "./VestingAction";
import type {Address} from "genlayer-js/types";

export interface VestingValidatorClaimOptions extends VestingConfig {
  wallet: string;
}

export class VestingValidatorClaimAction extends VestingAction {
  constructor() {
    super();
  }

  async execute(options: VestingValidatorClaimOptions): Promise<void> {
    this.startSpinner("Claiming vesting validator withdrawal...");

    try {
      const client = await this.getVestingClient(options);
      const vesting = await this.resolveBeneficiaryVesting(client, options);

      this.setSpinnerText(`Claiming vesting validator withdrawal from wallet ${options.wallet}...`);

      const result = await client.vestingValidatorClaim({
        vesting,
        wallet: options.wallet as Address,
      });

      const output = {
        transactionHash: result.transactionHash,
        vesting,
        wallet: options.wallet,
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
      };

      this.succeedSpinner("Vesting validator claim successful!", output);
    } catch (error: any) {
      this.failSpinner("Failed to claim vesting validator withdrawal", error.message || error);
    }
  }
}
