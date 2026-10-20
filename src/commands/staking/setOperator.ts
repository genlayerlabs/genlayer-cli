import {StakingAction, StakingConfig} from "./StakingAction";
import type {
  Address,
  GenLayerClient,
  GenLayerChain,
  OperatorRegistrationProof,
  StakingTransactionResult,
} from "genlayer-js/types";

export interface SetOperatorOptions extends StakingConfig {
  validator: string;
  operator: string;
  operatorAccount?: string;
  operatorPassword?: string;
}

/**
 * CON-715 replaced the wallet's single-call setOperator with a two-step
 * rotation: the owner initiates with a possession proof signed by the incoming
 * operator, then completes once the factory's operatorTransferDelay elapses.
 * The command name remains familiar, but it always uses the train's proof-bound
 * two-step flow.
 */
type OperatorTransferClient = GenLayerClient<GenLayerChain> & {
  initiateOperatorTransfer(o: {
    validator: Address;
    registration: OperatorRegistrationProof;
  }): Promise<StakingTransactionResult>;
  completeOperatorTransfer(o: {validator: Address}): Promise<StakingTransactionResult>;
  getPendingOperator(validator: Address): Promise<{operator: Address; initiatedAt: bigint}>;
};

export class SetOperatorAction extends StakingAction {
  constructor() {
    super();
  }

  async execute(options: SetOperatorOptions): Promise<void> {
    if (this.isBrowserWallet(options)) {
      return this.executeWithBrowserWallet(options);
    }

    this.startSpinner("Setting operator...");

    try {
      const validatorWallet = options.validator as Address;

      const client = await this.getStakingClient(options);

      this.setSpinnerText(`Setting operator to ${options.operator}...`);

      const output = await this.rotateOperator(client, validatorWallet, options);

      this.succeedSpinner("Operator updated!", output);
    } catch (error: any) {
      this.failSpinner("Failed to set operator", error.message || error);
    }
  }

  /**
   * Rotates via the train's initiate + complete flow.
   *
   * The incoming operator must sign its own possession proof, so its key has to
   * be reachable: --operator-account names it, otherwise we look it up in the
   * local keystore by address. Completion is attempted immediately because the
   * delay is commonly 0; when it is not, the transfer is left pending and the
   * caller is told to finish it with complete-operator-transfer.
   */
  private async rotateOperator(
    client: GenLayerClient<GenLayerChain>,
    validatorWallet: Address,
    options: SetOperatorOptions,
  ): Promise<Record<string, unknown>> {
    const operatorAccount =
      options.operatorAccount || this.findLocalAccountByAddress(options.operator);

    if (!operatorAccount) {
      throw new Error(
        "The incoming operator must sign its possession proof. Pass --operator-account " +
          "<name>, or use an operator address whose key is in the local keystore.",
      );
    }
    const registration = await this.createOperatorTransferRegistration(
      client,
      validatorWallet,
      operatorAccount,
      options.operatorPassword,
    );
    if (registration.operator.toLowerCase() !== options.operator.toLowerCase()) {
      throw new Error(
        `--operator ${options.operator} does not match the key in --operator-account ` +
          `${operatorAccount} (${registration.operator}).`,
      );
    }
    const transferClient = client as unknown as OperatorTransferClient;

    this.setSpinnerText(`Initiating operator transfer to ${options.operator}...`);
    const initiated = await transferClient.initiateOperatorTransfer({
      validator: validatorWallet,
      registration,
    });

    this.setSpinnerText("Completing operator transfer...");
    try {
      const completed = await transferClient.completeOperatorTransfer({validator: validatorWallet});
      return {
        transactionHash: completed.transactionHash,
        initiateTransactionHash: initiated.transactionHash,
        validator: validatorWallet,
        newOperator: options.operator,
        blockNumber: completed.blockNumber.toString(),
        gasUsed: completed.gasUsed.toString(),
      };
    } catch (completeError: any) {
      return {
        transactionHash: initiated.transactionHash,
        validator: validatorWallet,
        pendingOperator: options.operator,
        blockNumber: initiated.blockNumber.toString(),
        gasUsed: initiated.gasUsed.toString(),
        note:
          "Transfer initiated but not yet effective: " +
          `${completeError?.message ?? completeError}. ` +
          `Run: genlayer staking complete-operator-transfer ${validatorWallet}`,
      };
    }
  }

  private async executeWithBrowserWallet(options: SetOperatorOptions): Promise<void> {
    let session;
    try {
      session = await this.getBrowserWalletSession(options, "validator-join");
    } catch (error: any) {
      this.failSpinner("Failed to set operator", error.message || error);
      return;
    }

    this.startSpinner("Confirm the transaction in your browser wallet...");
    try {
      const validatorWallet = options.validator as Address;
      const client = this.getBrowserStakingClient(options, session);

      this.log(`  From (browser wallet): ${session.signerAddress}`);
      session.setNextLabel(`Rotate operator to ${options.operator}`);
      const output = await this.rotateOperator(client, validatorWallet, options);
      this.succeedSpinner("Operator updated!", output);
    } catch (error: any) {
      this.failSpinner("Failed to set operator", error.message || error);
    } finally {
      await session.close();
    }
  }
}

export interface OperatorTransferOptions extends StakingConfig {
  validator: string;
  operator?: string;
  operatorAccount?: string;
  operatorPassword?: string;
}

/** Starts a rotation without completing it, for delays that are not zero. */
export class InitiateOperatorTransferAction extends StakingAction {
  async execute(options: OperatorTransferOptions): Promise<void> {
    this.startSpinner("Initiating operator transfer...");
    try {
      const validatorWallet = options.validator as Address;
      const operatorAccount =
        options.operatorAccount ||
        (options.operator ? this.findLocalAccountByAddress(options.operator) : undefined);
      if (!operatorAccount) {
        throw new Error(
          "The incoming operator must sign its own possession proof. Pass --operator-account " +
            "<name>, or an --operator <address> whose key is in the local keystore.",
        );
      }

      const client = await this.getStakingClient(options);
      const registration = await this.createOperatorTransferRegistration(
        client,
        validatorWallet,
        operatorAccount,
        options.operatorPassword,
      );
      const result = await (client as unknown as OperatorTransferClient).initiateOperatorTransfer({
        validator: validatorWallet,
        registration,
      });

      this.succeedSpinner("Operator transfer initiated!", {
        transactionHash: result.transactionHash,
        validator: validatorWallet,
        pendingOperator: registration.operator,
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
      });
    } catch (error: any) {
      this.failSpinner("Failed to initiate operator transfer", error.message || error);
    }
  }
}

/** Finalises a pending rotation once the transfer delay has elapsed. */
export class CompleteOperatorTransferAction extends StakingAction {
  async execute(options: OperatorTransferOptions): Promise<void> {
    this.startSpinner("Completing operator transfer...");
    try {
      const validatorWallet = options.validator as Address;
      const client = (await this.getStakingClient(options)) as unknown as OperatorTransferClient;
      const result = await client.completeOperatorTransfer({validator: validatorWallet});

      this.succeedSpinner("Operator transfer completed!", {
        transactionHash: result.transactionHash,
        validator: validatorWallet,
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
      });
    } catch (error: any) {
      this.failSpinner("Failed to complete operator transfer", error.message || error);
    }
  }
}
