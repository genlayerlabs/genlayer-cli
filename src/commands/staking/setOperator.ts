import {StakingAction, StakingConfig} from "./StakingAction";
import type {
  Address,
  GenLayerClient,
  GenLayerChain,
  OperatorRegistrationProof,
  SetOperatorOptions as SdkSetOperatorOptions,
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
 * Both surfaces exist in the wild — older deployments only have setOperator,
 * newer ones only have the pair — so this command prefers the two-step flow and
 * falls back when the wallet does not expose it.
 */
type OperatorTransferClient = GenLayerClient<GenLayerChain> & {
  initiateOperatorTransfer(o: {
    validator: Address;
    registration: OperatorRegistrationProof;
  }): Promise<StakingTransactionResult>;
  completeOperatorTransfer(o: {validator: Address}): Promise<StakingTransactionResult>;
  getPendingOperator(validator: Address): Promise<{operator: Address; initiatedAt: bigint}>;
};

/**
 * A wallet without the new surface has no such selector, so the call reverts
 * with no decodable reason. Treat that — and an explicitly unknown function —
 * as "this deployment predates CON-715" and retry the legacy path.
 */
function looksLikeMissingSelector(error: any): boolean {
  const message = String(error?.message ?? error ?? "");
  return (
    /unknown reason/i.test(message) ||
    /function .*not found/i.test(message) ||
    /execution reverted/i.test(message)
  );
}

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

      // Route through the SDK staking client rather than a raw viem
      // writeContract. The SDK's executeWrite pins `type: "legacy"` and does
      // manual nonce/gas + sign + sendRawTransaction, which the GenLayer
      // consensus RPC requires (it has no EIP-1559 fee support, so viem's
      // default fee/tx-type negotiation fails). `setOperator` exists on the
      // client at runtime but is missing from the installed genlayer-js
      // StakingActions .d.ts — cast to bridge that type gap.
      const client = (await this.getStakingClient(options)) as GenLayerClient<GenLayerChain> & {
        setOperator(o: SdkSetOperatorOptions): Promise<StakingTransactionResult>;
      };

      this.setSpinnerText(`Setting operator to ${options.operator}...`);

      const output = await this.rotateOperator(client, validatorWallet, options);

      this.succeedSpinner("Operator updated!", output);
    } catch (error: any) {
      this.failSpinner("Failed to set operator", error.message || error);
    }
  }

  /**
   * Rotates via initiate + complete, falling back to the retired single call.
   *
   * The incoming operator must sign its own possession proof, so its key has to
   * be reachable: --operator-account names it, otherwise we look it up in the
   * local keystore by address. Completion is attempted immediately because the
   * delay is commonly 0; when it is not, the transfer is left pending and the
   * caller is told to finish it with complete-operator-transfer.
   */
  private async rotateOperator(
    client: GenLayerClient<GenLayerChain> & {
      setOperator(o: SdkSetOperatorOptions): Promise<StakingTransactionResult>;
    },
    validatorWallet: Address,
    options: SetOperatorOptions,
  ): Promise<Record<string, unknown>> {
    const operatorAccount =
      options.operatorAccount || this.findLocalAccountByAddress(options.operator);

    if (operatorAccount) {
      try {
        const registration = await this.createOperatorTransferRegistration(
          client,
          validatorWallet,
          operatorAccount,
          options.operatorPassword,
        );
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
      } catch (error: any) {
        if (!looksLikeMissingSelector(error)) {
          throw error;
        }
        // Wallet predates CON-715 — fall through to the single-call surface.
      }
    }

    this.setSpinnerText(`Setting operator to ${options.operator}...`);
    const result = await client.setOperator({
      validator: validatorWallet,
      operator: options.operator as Address,
    });

    return {
      transactionHash: result.transactionHash,
      validator: validatorWallet,
      newOperator: options.operator,
      blockNumber: result.blockNumber.toString(),
      gasUsed: result.gasUsed.toString(),
    };
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
      // `setOperator` exists at runtime but is missing from the installed
      // genlayer-js StakingActions .d.ts — cast to bridge that type gap.
      const client = this.getBrowserStakingClient(options, session) as GenLayerClient<GenLayerChain> & {
        setOperator(o: SdkSetOperatorOptions): Promise<StakingTransactionResult>;
      };

      this.log(`  From (browser wallet): ${session.signerAddress}`);
      session.setNextLabel(`Set operator to ${options.operator}`);
      const result = await client.setOperator({
        validator: validatorWallet,
        operator: options.operator as Address,
      });

      this.succeedSpinner("Operator updated!", {
        transactionHash: result.transactionHash,
        validator: validatorWallet,
        newOperator: options.operator,
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
      });
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
