import {StakingAction, StakingConfig} from "./StakingAction";
import type {GenLayerClient, GenLayerChain} from "genlayer-js/types";

export interface ValidatorJoinOptions extends StakingConfig {
  amount: string;
  operator?: string;
  operatorPassword?: string;
  force?: boolean;
}

export class ValidatorJoinAction extends StakingAction {
  constructor() {
    super();
  }

  /**
   * A fresh join always creates a NEW liquid (wallet-funded) validator wallet,
   * so the self-stake source is fixed at creation and the resulting self-stake
   * is exactly the join amount. Warn/block if that is below the on-chain
   * minimum, and surface the source note.
   */
  private async preflight(
    client: GenLayerClient<GenLayerChain>,
    amount: bigint,
    force?: boolean,
  ): Promise<void> {
    this.logInfo(
      "Creating a liquid (wallet-funded) validator. Self-stake source is fixed at creation — " +
        "you won't be able to add vesting tokens later.",
    );
    // The self-stake minimum is advisory. If the chain can't report it
    // (a minimal/stub staking contract without epoch/minStake reads, or a
    // transient read failure), skip the check rather than blocking the join.
    let epochInfo;
    try {
      epochInfo = await client.getEpochInfo();
    } catch {
      return;
    }
    this.assertOrWarnSelfStakeMinimum({
      currentEpoch: epochInfo.currentEpoch,
      minStakeRaw: epochInfo.validatorMinStakeRaw,
      minStakeFormatted: epochInfo.validatorMinStake,
      resultingSelfStakeRaw: amount,
      resultingSelfStakeFormatted: this.formatAmount(amount),
      force,
    });
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
      const operatorAccount =
        options.operator && options.operator.toLowerCase() !== signerAddress.toLowerCase()
          ? this.findLocalAccountByAddress(options.operator)
          : undefined;
      if (
        options.operator &&
        options.operator.toLowerCase() !== signerAddress.toLowerCase() &&
        !operatorAccount
      ) {
        throw new Error(
          `Operator ${options.operator} must match a local CLI account so its proof of possession can be signed. ` +
            "Import the operator keystore first or omit --operator to use the owner account.",
        );
      }

      await this.preflight(client, amount, options.force);

      const registration = await this.createValidatorRegistration(
        client,
        operatorAccount,
        options.operatorPassword,
      );

      this.setSpinnerText(`Creating validator with ${this.formatAmount(amount)} stake...`);
      this.log(`  From: ${signerAddress}`);
      this.log(`  Operator: ${registration.operator}`);

      const result = await client.validatorJoin({
        amount,
        registration,
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
      if (!options.operator) {
        throw new Error(
          "Browser-wallet validator joins require --operator to name a local CLI operator account. " +
            "Import or create the operator keystore first.",
        );
      }
      const operatorAccount = this.findLocalAccountByAddress(options.operator);
      if (!operatorAccount) {
        throw new Error(
          `Operator ${options.operator} must match a local CLI account so its proof of possession can be signed.`,
        );
      }

      await this.preflight(client, amount, options.force);

      const registration = await this.createValidatorRegistration(
        client,
        operatorAccount,
        options.operatorPassword,
      );

      this.log(`  From (browser wallet): ${session.signerAddress}`);
      this.log(`  Operator: ${registration.operator}`);

      // Same SDK call as the keystore lane; the SDK decodes the ValidatorJoin
      // event and returns validatorWallet for both lanes.
      session.setNextLabel(`Join as validator (${this.formatAmount(amount)})`);
      const result = await client.validatorJoin({
        amount,
        registration,
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
