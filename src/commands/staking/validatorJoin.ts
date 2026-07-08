import {StakingAction, StakingConfig} from "./StakingAction";
import type {Address} from "genlayer-js/types";
import {buildValidatorJoinTx, extractValidatorWallet} from "../../lib/wallet/stakingTx";

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
      const {to, data} = buildValidatorJoinTx(session.stakingAddress, options.operator);

      this.log(`  From (browser wallet): ${session.signerAddress}`);
      if (options.operator) {
        this.log(`  Operator: ${options.operator}`);
      }

      const receipt = await session.sendTransaction({
        to,
        data,
        value: amount,
        label: `Join as validator (${this.formatAmount(amount)})`,
      });

      const validatorWallet = extractValidatorWallet(receipt);

      this.succeedSpinner("Validator created successfully!", {
        transactionHash: receipt.transactionHash,
        validatorWallet,
        amount: this.formatAmount(amount),
        operator: options.operator ?? session.signerAddress,
        blockNumber: receipt.blockNumber.toString(),
        gasUsed: receipt.gasUsed.toString(),
      });
    } catch (error: any) {
      this.failSpinner("Failed to create validator", error.message || error);
    } finally {
      await session.bridge.close();
    }
  }
}
