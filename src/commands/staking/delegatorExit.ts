import {StakingAction, StakingConfig} from "./StakingAction";
import type {Address} from "genlayer-js/types";

export interface DelegatorExitOptions extends StakingConfig {
  validator: string;
  shares: string;
}

export class DelegatorExitAction extends StakingAction {
  constructor() {
    super();
  }

  async execute(options: DelegatorExitOptions): Promise<void> {
    this.startSpinner("Initiating delegator exit...");

    try {
      let shares: bigint;
      try {
        shares = BigInt(options.shares);
        if (shares <= 0n) throw new Error("must be positive");
      } catch {
        this.failSpinner(`Invalid shares value: "${options.shares}". Must be a positive whole number.`);
        return;
      }

      const client = await this.getStakingClient(options);

      this.setSpinnerText(`Exiting ${shares} shares from validator ${options.validator}...`);

      const result = await client.delegatorExit({
        validator: options.validator as Address,
        shares,
      });

      // Check epoch to determine note
      const epochInfo = await client.getEpochInfo();
      const isEpochZero = epochInfo.currentEpoch === 0n;

      const output = {
        transactionHash: result.transactionHash,
        validator: options.validator,
        sharesWithdrawn: shares.toString(),
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
        note: isEpochZero
          ? "Epoch 0: Withdrawal claimable immediately"
          : "Withdrawal will be claimable after the unbonding period",
      };

      this.succeedSpinner("Exit initiated successfully!", output);
    } catch (error: any) {
      this.failSpinner("Failed to exit", error.message || error);
    }
  }
}
