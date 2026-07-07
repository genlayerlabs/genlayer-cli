import {VestingAction, VestingConfig} from "./VestingAction";
import type {Address} from "genlayer-js/types";

export interface VestingValidatorExitOptions extends VestingConfig {
  wallet: string;
  shares: string;
}

export class VestingValidatorExitAction extends VestingAction {
  constructor() {
    super();
  }

  async execute(options: VestingValidatorExitOptions): Promise<void> {
    this.startSpinner("Initiating vesting validator exit...");

    try {
      let shares: bigint;
      try {
        shares = BigInt(options.shares);
        if (shares <= 0n) throw new Error("must be positive");
      } catch {
        this.failSpinner(`Invalid shares value: "${options.shares}". Must be a positive whole number.`);
        return;
      }

      const client = await this.getVestingClient(options);
      const vesting = await this.resolveBeneficiaryVesting(client, options);

      this.setSpinnerText(`Exiting ${shares.toString()} validator shares from wallet ${options.wallet}...`);

      const result = await client.vestingValidatorExit({
        vesting,
        wallet: options.wallet as Address,
        shares,
      });

      const output = {
        transactionHash: result.transactionHash,
        vesting,
        wallet: options.wallet,
        sharesWithdrawn: shares.toString(),
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
        note: "Withdrawal will be claimable after the unbonding period unless settled immediately in epoch 0",
      };

      this.succeedSpinner("Vesting validator exit initiated!", output);
    } catch (error: any) {
      this.failSpinner("Failed to exit vesting validator", error.message || error);
    }
  }
}
