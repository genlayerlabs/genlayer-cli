import {VestingAction, VestingConfig} from "./VestingAction";
import type {Address} from "genlayer-js/types";
import {abi} from "genlayer-js";
import {buildTx} from "../../lib/wallet/txBuilders";

export interface VestingClaimOptions extends VestingConfig {
  validator: string;
}

export class VestingClaimAction extends VestingAction {
  constructor() {
    super();
  }

  async execute(options: VestingClaimOptions): Promise<void> {
    if (this.isBrowserWallet(options)) {
      return this.executeWithBrowserWallet(options);
    }

    this.startSpinner("Claiming vesting delegation withdrawal...");

    try {
      const client = await this.getVestingClient(options);
      const vesting = await this.resolveBeneficiaryVesting(client, options);

      this.setSpinnerText(`Claiming vesting delegation withdrawal from validator ${options.validator}...`);

      const result = await client.vestingDelegatorClaim({
        vesting,
        validator: options.validator as Address,
      });

      const output = {
        transactionHash: result.transactionHash,
        vesting,
        validator: options.validator,
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
      };

      this.succeedSpinner("Vesting claim successful!", output);
    } catch (error: any) {
      this.failSpinner("Failed to claim vesting withdrawal", error.message || error);
    }
  }

  private async executeWithBrowserWallet(options: VestingClaimOptions): Promise<void> {
    let session;
    try {
      session = await this.getVestingBrowserSession(options);
    } catch (error: any) {
      this.failSpinner("Failed to claim vesting withdrawal", error.message || error);
      return;
    }

    this.startSpinner("Confirm the transaction in your browser wallet...");

    try {
      const readClient = await this.getReadOnlyVestingClient(options);
      const vesting = await this.resolveBeneficiaryVesting(readClient, options);

      const {to, data} = buildTx(abi.VESTING_ABI as any, vesting, "vestingDelegatorClaim", [options.validator]);

      const receipt = await session.sendTransaction({
        to,
        data,
        label: "Claim vesting delegation withdrawal",
      });

      this.succeedSpinner("Vesting claim successful!", {
        transactionHash: receipt.transactionHash,
        vesting,
        validator: options.validator,
        blockNumber: receipt.blockNumber.toString(),
        gasUsed: receipt.gasUsed.toString(),
      });
    } catch (error: any) {
      this.failSpinner("Failed to claim vesting withdrawal", error.message || error);
    } finally {
      await session.close();
    }
  }
}
