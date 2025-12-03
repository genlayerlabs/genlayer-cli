import {StakingAction, StakingConfig} from "./StakingAction";

export interface ValidatorExitOptions extends StakingConfig {
  shares: string;
}

export class ValidatorExitAction extends StakingAction {
  constructor() {
    super();
  }

  async execute(options: ValidatorExitOptions): Promise<void> {
    this.startSpinner("Initiating validator exit...");

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

      this.setSpinnerText(`Exiting with ${shares} shares...`);

      const result = await client.validatorExit({shares});

      const output = {
        transactionHash: result.transactionHash,
        sharesWithdrawn: shares.toString(),
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
        note: "Withdrawal will be claimable after the unbonding period",
      };

      this.succeedSpinner("Exit initiated successfully!", output);
    } catch (error: any) {
      this.failSpinner("Failed to exit", error.message || error);
    }
  }
}
