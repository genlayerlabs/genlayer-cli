import {StakingAction, StakingConfig} from "./StakingAction";
import type {
  Address,
  GenLayerClient,
  GenLayerChain,
  SetOperatorOptions as SdkSetOperatorOptions,
  StakingTransactionResult,
} from "genlayer-js/types";

export interface SetOperatorOptions extends StakingConfig {
  validator: string;
  operator: string;
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

      const result = await client.setOperator({
        validator: validatorWallet,
        operator: options.operator as Address,
      });

      const output = {
        transactionHash: result.transactionHash,
        validator: validatorWallet,
        newOperator: options.operator,
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
      };

      this.succeedSpinner("Operator updated!", output);
    } catch (error: any) {
      this.failSpinner("Failed to set operator", error.message || error);
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
