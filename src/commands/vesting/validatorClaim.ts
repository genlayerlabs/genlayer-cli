import {VestingAction, VestingConfig} from "./VestingAction";
import type {Address} from "genlayer-js/types";
import {abi} from "genlayer-js";
import {buildTx} from "../../lib/wallet/txBuilders";

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
      const readClient = await this.getReadOnlyVestingClient(options);
      const vesting = await this.resolveBeneficiaryVesting(readClient, options);

      const {to, data} = buildTx(abi.VESTING_ABI as any, vesting, "vestingValidatorClaim", [
        options.walletAddress,
      ]);

      const receipt = await session.sendTransaction({
        to,
        data,
        label: "Claim vesting validator withdrawal",
      });

      this.succeedSpinner("Vesting validator claim successful!", {
        transactionHash: receipt.transactionHash,
        vesting,
        wallet: options.walletAddress,
        blockNumber: receipt.blockNumber.toString(),
        gasUsed: receipt.gasUsed.toString(),
      });
    } catch (error: any) {
      this.failSpinner("Failed to claim vesting validator withdrawal", error.message || error);
    } finally {
      await session.close();
    }
  }
}
