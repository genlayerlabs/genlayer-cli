import {StakingAction, StakingConfig} from "./StakingAction";
import type {Address} from "genlayer-js/types";
import {abi} from "genlayer-js";
import {buildTx} from "../../lib/wallet/txBuilders";

export interface ValidatorDepositOptions extends StakingConfig {
  amount: string;
  validator: string;
}

export class ValidatorDepositAction extends StakingAction {
  constructor() {
    super();
  }

  async execute(options: ValidatorDepositOptions): Promise<void> {
    if (this.isBrowserWallet(options)) {
      return this.executeWithBrowserWallet(options);
    }

    this.startSpinner("Making validator deposit...");

    try {
      const amount = this.parseAmount(options.amount);
      const validatorWallet = options.validator as Address;

      // Route through the SDK's staking action rather than a raw viem
      // writeContract. The SDK's executeWrite pins `type: "legacy"` and does
      // manual nonce/gas + sign + sendRawTransaction, which the GenLayer
      // consensus RPC requires (it has no EIP-1559 fee support, so viem's
      // default fee/tx-type negotiation fails). The action forwards to the
      // ValidatorWallet's own `validatorDeposit`, preserving msg.sender ==
      // ValidatorWallet when it re-enters Staking.
      const client = await this.getStakingClient(options);

      this.setSpinnerText(`Depositing ${this.formatAmount(amount)} to validator ${validatorWallet}...`);

      const result = await client.validatorDeposit({
        validator: validatorWallet,
        amount,
      });

      const output = {
        transactionHash: result.transactionHash,
        validator: validatorWallet,
        amount: this.formatAmount(amount),
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
      };

      this.succeedSpinner("Deposit successful!", output);
    } catch (error: any) {
      this.failSpinner("Failed to make deposit", error.message || error);
    }
  }

  private async executeWithBrowserWallet(options: ValidatorDepositOptions): Promise<void> {
    let session;
    try {
      session = await this.getBrowserWalletSession(options, "validator-join");
    } catch (error: any) {
      this.failSpinner("Failed to make deposit", error.message || error);
      return;
    }

    this.startSpinner("Confirm the transaction in your browser wallet...");
    try {
      const amount = this.parseAmount(options.amount);
      const validatorWallet = options.validator as Address;
      const {to, data} = buildTx(abi.VALIDATOR_WALLET_ABI as any, validatorWallet, "validatorDeposit");

      this.log(`  From (browser wallet): ${session.signerAddress}`);
      const receipt = await session.sendTransaction({
        to,
        data,
        value: amount,
        label: `Deposit ${this.formatAmount(amount)} to validator`,
      });

      this.succeedSpinner("Deposit successful!", {
        transactionHash: receipt.transactionHash,
        validator: validatorWallet,
        amount: this.formatAmount(amount),
        blockNumber: receipt.blockNumber.toString(),
        gasUsed: receipt.gasUsed.toString(),
      });
    } catch (error: any) {
      this.failSpinner("Failed to make deposit", error.message || error);
    } finally {
      await session.close();
    }
  }
}
