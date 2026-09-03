import {StakingAction, StakingConfig} from "./StakingAction";
import type {Address} from "genlayer-js/types";

export interface ValidatorExitOptions extends StakingConfig {
  validator: string;
  shares: string;
}

export class ValidatorExitAction extends StakingAction {
  constructor() {
    super();
  }

  async execute(options: ValidatorExitOptions): Promise<void> {
    if (this.isBrowserWallet(options)) {
      return this.executeWithBrowserWallet(options);
    }

    this.startSpinner("Initiating validator exit...");

    try {
      let shares: bigint;
      try {
        shares = BigInt(options.shares);
        if (shares <= 0n) throw new Error("must be positive");
      } catch {
        this.failSpinner(`Invalid shares value: "${options.shares}". Must be a positive whole number.`);
        return;
      }

      const validatorWallet = options.validator as Address;

      // Route through the SDK's staking action rather than a raw viem
      // writeContract. The SDK's executeWrite pins `type: "legacy"` and does
      // manual nonce/gas + sign + sendRawTransaction, which the GenLayer
      // consensus RPC requires (it has no EIP-1559 fee support, so viem's
      // default fee/tx-type negotiation fails). The action forwards to the
      // ValidatorWallet's own `validatorExit`, preserving msg.sender ==
      // ValidatorWallet when it re-enters Staking.
      const client = await this.getStakingClient(options);

      this.setSpinnerText(`Exiting validator ${validatorWallet} with ${shares} shares...`);

      const result = await client.validatorExit({
        validator: validatorWallet,
        shares,
      });

      // Check epoch to determine note
      const epochInfo = await client.getEpochInfo();
      const isEpochZero = epochInfo.currentEpoch === 0n;

      const output = {
        transactionHash: result.transactionHash,
        validator: validatorWallet,
        sharesWithdrawn: shares.toString(),
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
        note: isEpochZero
          ? "Epoch 0: Withdrawal claimable immediately"
          : "Withdrawal will be claimable after the unbonding period",
      };

      this.succeedSpinner("Exit initiated successfully!", output);
    } catch (error: any) {
      this.failSpinner("Failed to exit", error.message || error);
    }
  }

  private async executeWithBrowserWallet(options: ValidatorExitOptions): Promise<void> {
    let session;
    try {
      session = await this.getBrowserWalletSession(options, "validator-join");
    } catch (error: any) {
      this.failSpinner("Failed to exit", error.message || error);
      return;
    }

    this.startSpinner("Confirm the transaction in your browser wallet...");
    try {
      let shares: bigint;
      try {
        shares = BigInt(options.shares);
        if (shares <= 0n) throw new Error("must be positive");
      } catch {
        this.failSpinner(`Invalid shares value: "${options.shares}". Must be a positive whole number.`);
        return;
      }

      const validatorWallet = options.validator as Address;
      const client = this.getBrowserStakingClient(options, session);

      this.log(`  From (browser wallet): ${session.signerAddress}`);
      session.setNextLabel(`Exit validator (${shares} shares)`);
      const result = await client.validatorExit({
        validator: validatorWallet,
        shares,
      });

      // Check epoch to determine note
      const epochInfo = await client.getEpochInfo();
      const isEpochZero = epochInfo.currentEpoch === 0n;

      this.succeedSpinner("Exit initiated successfully!", {
        transactionHash: result.transactionHash,
        validator: validatorWallet,
        sharesWithdrawn: shares.toString(),
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
        note: isEpochZero
          ? "Epoch 0: Withdrawal claimable immediately"
          : "Withdrawal will be claimable after the unbonding period",
      });
    } catch (error: any) {
      this.failSpinner("Failed to exit", error.message || error);
    } finally {
      await session.close();
    }
  }
}
