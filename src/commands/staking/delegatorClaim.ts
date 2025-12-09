import {StakingAction, StakingConfig} from "./StakingAction";
import type {Address} from "genlayer-js/types";

export interface DelegatorClaimOptions extends StakingConfig {
  validator: string;
  delegator?: string;
}

export class DelegatorClaimAction extends StakingAction {
  constructor() {
    super();
  }

  async execute(options: DelegatorClaimOptions): Promise<void> {
    this.startSpinner("Claiming delegator withdrawals...");

    try {
      const client = await this.getStakingClient(options);
      const delegatorAddress = options.delegator || (await this.getSignerAddress());

      this.setSpinnerText(`Claiming for delegator ${delegatorAddress} from validator ${options.validator}...`);

      const result = await client.delegatorClaim({
        validator: options.validator as Address,
        delegator: delegatorAddress as Address,
      });

      const output = {
        transactionHash: result.transactionHash,
        delegator: delegatorAddress,
        validator: options.validator,
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
      };

      this.succeedSpinner("Claim successful!", output);
    } catch (error: any) {
      this.failSpinner("Failed to claim", error.message || error);
    }
  }
}
