import {StakingAction, StakingConfig} from "./StakingAction";
import type {Address} from "genlayer-js/types";
import {abi} from "genlayer-js";
import {buildTx} from "../../lib/wallet/txBuilders";

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
      const {walletClient, publicClient} = await this.getViemClients(options);

      this.setSpinnerText(`Setting operator to ${options.operator}...`);

      const hash = await walletClient.writeContract({
        address: validatorWallet,
        abi: abi.VALIDATOR_WALLET_ABI,
        functionName: "setOperator",
        args: [options.operator as Address],
      });

      const receipt = await publicClient.waitForTransactionReceipt({hash});

      const output = {
        transactionHash: receipt.transactionHash,
        validator: validatorWallet,
        newOperator: options.operator,
        blockNumber: receipt.blockNumber.toString(),
        gasUsed: receipt.gasUsed.toString(),
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
      const {to, data} = buildTx(abi.VALIDATOR_WALLET_ABI as any, validatorWallet, "setOperator", [
        options.operator as Address,
      ]);

      this.log(`  From (browser wallet): ${session.signerAddress}`);
      const receipt = await session.sendTransaction({
        to,
        data,
        label: `Set operator to ${options.operator}`,
      });

      this.succeedSpinner("Operator updated!", {
        transactionHash: receipt.transactionHash,
        validator: validatorWallet,
        newOperator: options.operator,
        blockNumber: receipt.blockNumber.toString(),
        gasUsed: receipt.gasUsed.toString(),
      });
    } catch (error: any) {
      this.failSpinner("Failed to set operator", error.message || error);
    } finally {
      await session.close();
    }
  }
}
