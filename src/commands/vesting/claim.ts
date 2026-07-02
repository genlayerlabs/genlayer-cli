import {VestingAction, VestingConfig} from "./VestingAction";
import type {Address} from "genlayer-js/types";

export interface VestingClaimOptions extends VestingConfig {
  validator: string;
}

export class VestingClaimAction extends VestingAction {
  constructor() {
    super();
  }

  async execute(options: VestingClaimOptions): Promise<void> {
    this.startSpinner("Claiming vesting delegation withdrawal...");

    try {
      const client = await this.getVestingClient(options);
      const vesting = await this.resolveBeneficiaryVesting(client, options);

      this.setSpinnerText(`Claiming vesting delegation withdrawal from validator ${options.validator}...`);

      const result = await client.vestingDelegatorClaim({
        vesting,
        validator: options.validator as Address,
      });

      const output = {
        transactionHash: result.transactionHash,
        vesting,
        validator: options.validator,
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
      };

      this.succeedSpinner("Vesting claim successful!", output);
    } catch (error: any) {
      this.failSpinner("Failed to claim vesting withdrawal", error.message || error);
    }
  }
}
