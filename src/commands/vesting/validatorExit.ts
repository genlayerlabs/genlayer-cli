import {VestingAction, VestingConfig} from "./VestingAction";
import type {Address} from "genlayer-js/types";

export interface VestingValidatorExitOptions extends VestingConfig {
  walletAddress: string;
  shares: string;
}

export class VestingValidatorExitAction extends VestingAction {
  constructor() {
    super();
  }

  async execute(options: VestingValidatorExitOptions): Promise<void> {
    if (this.isBrowserWallet(options)) {
      return this.executeWithBrowserWallet(options);
    }

    this.startSpinner("Initiating vesting validator exit...");

    try {
      let shares: bigint;
      try {
        shares = BigInt(options.shares);
        if (shares <= 0n) throw new Error("must be positive");
      } catch {
        this.failSpinner(`Invalid shares value: "${options.shares}". Must be a positive whole number.`);
        return;
      }

      const client = await this.getVestingClient(options);
      const vesting = await this.resolveBeneficiaryVesting(client, options);

      this.setSpinnerText(`Exiting ${shares.toString()} validator shares from wallet ${options.walletAddress}...`);

      const result = await client.vestingValidatorExit({
        vesting,
        wallet: options.walletAddress as Address,
        shares,
      });

      const output = {
        transactionHash: result.transactionHash,
        vesting,
        wallet: options.walletAddress,
        sharesWithdrawn: shares.toString(),
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
        note: "Withdrawal will be claimable after the unbonding period unless settled immediately in epoch 0",
      };

      this.succeedSpinner("Vesting validator exit initiated!", output);
    } catch (error: any) {
      this.failSpinner("Failed to exit vesting validator", error.message || error);
    }
  }

  private async executeWithBrowserWallet(options: VestingValidatorExitOptions): Promise<void> {
    let session;
    try {
      session = await this.getVestingBrowserSession(options);
    } catch (error: any) {
      this.failSpinner("Failed to exit vesting validator", error.message || error);
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

      const client = this.getBrowserVestingClient(options, session);
      const vesting = await this.resolveBeneficiaryVesting(client, options);

      session.setNextLabel(`Exit ${shares.toString()} validator shares`);
      const result = await client.vestingValidatorExit({
        vesting,
        wallet: options.walletAddress as Address,
        shares,
      });

      this.succeedSpinner("Vesting validator exit initiated!", {
        transactionHash: result.transactionHash,
        vesting,
        wallet: options.walletAddress,
        sharesWithdrawn: shares.toString(),
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
        note: "Withdrawal will be claimable after the unbonding period unless settled immediately in epoch 0",
      });
    } catch (error: any) {
      this.failSpinner("Failed to exit vesting validator", error.message || error);
    } finally {
      await session.close();
    }
  }
}
