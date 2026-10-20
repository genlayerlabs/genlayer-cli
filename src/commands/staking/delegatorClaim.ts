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
    if (this.isBrowserWallet(options)) {
      return this.executeWithBrowserWallet(options);
    }

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

  private async executeWithBrowserWallet(options: DelegatorClaimOptions): Promise<void> {
    let session;
    try {
      session = await this.getBrowserWalletSession(options, "validator-join");
    } catch (error: any) {
      this.failSpinner("Failed to claim", error.message || error);
      return;
    }

    this.startSpinner("Confirm the transaction in your browser wallet...");
    try {
      const delegatorAddress = options.delegator || session.signerAddress;
      const client = this.getBrowserStakingClient(options, session);

      this.log(`  From (browser wallet): ${session.signerAddress}`);
      session.setNextLabel(`Claim delegator withdrawals`);
      const result = await client.delegatorClaim({
        validator: options.validator as Address,
        delegator: delegatorAddress as Address,
      });

      this.succeedSpinner("Claim successful!", {
        transactionHash: result.transactionHash,
        delegator: delegatorAddress,
        validator: options.validator,
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
      });
    } catch (error: any) {
      this.failSpinner("Failed to claim", error.message || error);
    } finally {
      await session.close();
    }
  }
}
