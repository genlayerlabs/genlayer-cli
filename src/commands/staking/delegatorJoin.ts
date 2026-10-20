import {StakingAction, StakingConfig} from "./StakingAction";
import type {Address} from "genlayer-js/types";
import chalk from "chalk";

export interface DelegatorJoinOptions extends StakingConfig {
  validator: string;
  amount: string;
}

export class DelegatorJoinAction extends StakingAction {
  constructor() {
    super();
  }

  async execute(options: DelegatorJoinOptions): Promise<void> {
    if (this.isBrowserWallet(options)) {
      return this.executeWithBrowserWallet(options);
    }

    this.startSpinner("Joining as delegator...");

    try {
      const client = await this.getStakingClient(options);
      const amount = this.parseAmount(options.amount);

      this.setSpinnerText(`Delegating ${this.formatAmount(amount)} to validator ${options.validator}...`);

      const result = await client.delegatorJoin({
        validator: options.validator as Address,
        amount,
      });

      const output = {
        transactionHash: result.transactionHash,
        validator: result.validator,
        amount: result.amount,
        delegator: result.delegator,
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
      };

      this.succeedSpinner("Successfully joined as delegator!", output);
      console.log(chalk.dim(`\nTo view your delegation: genlayer staking delegation-info --validator ${options.validator}`));
    } catch (error: any) {
      this.failSpinner("Failed to join as delegator", error.message || error);
    }
  }

  private async executeWithBrowserWallet(options: DelegatorJoinOptions): Promise<void> {
    let session;
    try {
      session = await this.getBrowserWalletSession(options, "validator-join");
    } catch (error: any) {
      this.failSpinner("Failed to join as delegator", error.message || error);
      return;
    }

    this.startSpinner("Confirm the transaction in your browser wallet...");
    try {
      const amount = this.parseAmount(options.amount);
      const client = this.getBrowserStakingClient(options, session);

      this.log(`  From (browser wallet): ${session.signerAddress}`);
      session.setNextLabel(`Delegate ${this.formatAmount(amount)} to validator`);
      const result = await client.delegatorJoin({
        validator: options.validator as Address,
        amount,
      });

      this.succeedSpinner("Successfully joined as delegator!", {
        transactionHash: result.transactionHash,
        validator: result.validator,
        amount: result.amount,
        delegator: result.delegator,
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
      });
      console.log(chalk.dim(`\nTo view your delegation: genlayer staking delegation-info --validator ${options.validator}`));
    } catch (error: any) {
      this.failSpinner("Failed to join as delegator", error.message || error);
    } finally {
      await session.close();
    }
  }
}
