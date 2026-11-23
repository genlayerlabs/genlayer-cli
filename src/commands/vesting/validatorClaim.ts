import {VestingAction, VestingConfig} from "./VestingAction";
import type {Address} from "genlayer-js/types";

export interface VestingValidatorClaimOptions extends VestingConfig {
  walletAddress: string;
}

export class VestingValidatorClaimAction extends VestingAction {
  constructor() {
    super();
  }

  async execute(options: VestingValidatorClaimOptions): Promise<void> {
    if (this.isBrowserWallet(options)) {
      return this.executeWithBrowserWallet(options);
    }

    this.startSpinner("Claiming vesting validator withdrawal...");

    try {
      const client = await this.getVestingClient(options);
      const vesting = await this.resolveBeneficiaryVesting(client, options);

      this.setSpinnerText(`Claiming vesting validator withdrawal from wallet ${options.walletAddress}...`);

      const result = await client.vestingValidatorClaim({
        vesting,
        wallet: options.walletAddress as Address,
      });

      const output = {
        transactionHash: result.transactionHash,
        vesting,
        wallet: options.walletAddress,
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
      };

      this.succeedSpinner("Vesting validator claim successful!", output);
    } catch (error: any) {
      this.failSpinner("Failed to claim vesting validator withdrawal", error.message || error);
    }
  }

  private async executeWithBrowserWallet(options: VestingValidatorClaimOptions): Promise<void> {
    let session;
    try {
      session = await this.getVestingBrowserSession(options);
    } catch (error: any) {
      this.failSpinner("Failed to claim vesting validator withdrawal", error.message || error);
      return;
    }

    this.startSpinner("Confirm the transaction in your browser wallet...");

    try {
      const client = this.getBrowserVestingClient(options, session);
      const vesting = await this.resolveBeneficiaryVesting(client, options);

      session.setNextLabel("Claim vesting validator withdrawal");
      const result = await client.vestingValidatorClaim({
        vesting,
        wallet: options.walletAddress as Address,
      });

      this.succeedSpinner("Vesting validator claim successful!", {
        transactionHash: result.transactionHash,
        vesting,
        wallet: options.walletAddress,
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
      });
    } catch (error: any) {
      this.failSpinner("Failed to claim vesting validator withdrawal", error.message || error);
    } finally {
      await session.close();
    }
  }
}
