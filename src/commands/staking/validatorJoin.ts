import {StakingAction, StakingConfig} from "./StakingAction";
import type {Address} from "genlayer-js/types";

export interface ValidatorJoinOptions extends StakingConfig {
  amount: string;
  operator?: string;
}

export class ValidatorJoinAction extends StakingAction {
  constructor() {
    super();
  }

  async execute(options: ValidatorJoinOptions): Promise<void> {
    if (this.isBrowserWallet(options)) {
      return this.executeWithBrowserWallet(options);
    }

    this.startSpinner("Creating a new validator...");

    try {
      const client = await this.getStakingClient(options);
      const amount = this.parseAmount(options.amount);
      const signerAddress = await this.getSignerAddress();

      this.setSpinnerText(`Creating validator with ${this.formatAmount(amount)} stake...`);
      this.log(`  From: ${signerAddress}`);
      if (options.operator) {
        this.log(`  Operator: ${options.operator}`);
      }

      const result = await client.validatorJoin({
        amount,
        operator: options.operator as Address | undefined,
      });

      const output = {
        transactionHash: result.transactionHash,
        validatorWallet: result.validatorWallet,
        amount: result.amount,
        operator: result.operator,
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
      };

      this.succeedSpinner("Validator created successfully!", output);
    } catch (error: any) {
      this.failSpinner("Failed to create validator", error.message || error);
    }
  }

  private async executeWithBrowserWallet(options: ValidatorJoinOptions): Promise<void> {
    let session;
    try {
      session = await this.getBrowserWalletSession(options, "validator-join");
    } catch (error: any) {
      this.failSpinner("Failed to create validator", error.message || error);
      return;
    }

    this.startSpinner("Confirm the transaction in your browser wallet...");
    try {
      const amount = this.parseAmount(options.amount);
      const client = this.getBrowserStakingClient(options, session);

      this.log(`  From (browser wallet): ${session.signerAddress}`);
      if (options.operator) {
        this.log(`  Operator: ${options.operator}`);
      }

      // Same SDK call as the keystore lane; the SDK decodes the ValidatorJoin
      // event and returns validatorWallet for both lanes.
      session.setNextLabel(`Join as validator (${this.formatAmount(amount)})`);
      const result = await client.validatorJoin({
        amount,
        operator: options.operator as Address | undefined,
      });

      this.succeedSpinner("Validator created successfully!", {
        transactionHash: result.transactionHash,
        validatorWallet: result.validatorWallet,
        amount: result.amount,
        operator: result.operator,
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
      });
    } catch (error: any) {
      this.failSpinner("Failed to create validator", error.message || error);
    } finally {
      // session.close() is a no-op for a remote (daemon) session and a full
      // close for an own bridge — so a shared daemon survives the command.
      await session.close();
    }
  }
}
