import {StakingAction, StakingConfig} from "./StakingAction";
import type {Address} from "genlayer-js/types";
import {abi} from "genlayer-js";
import {buildTx} from "../../lib/wallet/txBuilders";

export interface DelegatorExitOptions extends StakingConfig {
  validator: string;
  shares: string;
}

export class DelegatorExitAction extends StakingAction {
  constructor() {
    super();
  }

  async execute(options: DelegatorExitOptions): Promise<void> {
    if (this.isBrowserWallet(options)) {
      return this.executeWithBrowserWallet(options);
    }

    this.startSpinner("Initiating delegator exit...");

    try {
      let shares: bigint;
      try {
        shares = BigInt(options.shares);
        if (shares <= 0n) throw new Error("must be positive");
      } catch {
        this.failSpinner(`Invalid shares value: "${options.shares}". Must be a positive whole number.`);
        return;
      }

      const client = await this.getStakingClient(options);

      this.setSpinnerText(`Exiting ${shares} shares from validator ${options.validator}...`);

      const result = await client.delegatorExit({
        validator: options.validator as Address,
        shares,
      });

      // Check epoch to determine note
      const epochInfo = await client.getEpochInfo();
      const isEpochZero = epochInfo.currentEpoch === 0n;

      const output = {
        transactionHash: result.transactionHash,
        validator: options.validator,
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

  private async executeWithBrowserWallet(options: DelegatorExitOptions): Promise<void> {
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

      const {to, data} = buildTx(abi.STAKING_ABI as any, session.stakingAddress, "delegatorExit", [
        options.validator as Address,
        shares,
      ]);

      this.log(`  From (browser wallet): ${session.signerAddress}`);
      const receipt = await session.sendTransaction({
        to,
        data,
        label: `Exit ${shares} shares from validator`,
      });

      // Check epoch to determine note
      const readClient = await this.getReadOnlyStakingClient(options);
      const epochInfo = await readClient.getEpochInfo();
      const isEpochZero = epochInfo.currentEpoch === 0n;

      this.succeedSpinner("Exit initiated successfully!", {
        transactionHash: receipt.transactionHash,
        validator: options.validator,
        sharesWithdrawn: shares.toString(),
        blockNumber: receipt.blockNumber.toString(),
        gasUsed: receipt.gasUsed.toString(),
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
