import {VestingAction, VestingConfig} from "./VestingAction";
import type {Address} from "genlayer-js/types";
import {abi} from "genlayer-js";
import {buildTx} from "../../lib/wallet/txBuilders";

export interface VestingValidatorDepositOptions extends VestingConfig {
  walletAddress: string;
  amount: string;
}

export class VestingValidatorDepositAction extends VestingAction {
  constructor() {
    super();
  }

  async execute(options: VestingValidatorDepositOptions): Promise<void> {
    if (this.isBrowserWallet(options)) {
      return this.executeWithBrowserWallet(options);
    }

    this.startSpinner("Depositing vesting tokens to validator...");

    try {
      const client = await this.getVestingClient(options);
      const amount = this.parseAmount(options.amount);
      const vesting = await this.resolveBeneficiaryVesting(client, options);

      this.setSpinnerText(`Depositing ${this.formatAmount(amount)} from vesting ${vesting} to wallet ${options.walletAddress}...`);

      const result = await client.vestingValidatorDeposit({
        vesting,
        wallet: options.walletAddress as Address,
        amount,
      });

      const output = {
        transactionHash: result.transactionHash,
        vesting,
        wallet: options.walletAddress,
        amount: this.formatAmount(amount),
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
      };

      this.succeedSpinner("Vesting validator deposit successful!", output);
    } catch (error: any) {
      this.failSpinner("Failed to deposit vesting validator tokens", error.message || error);
    }
  }

  private async executeWithBrowserWallet(options: VestingValidatorDepositOptions): Promise<void> {
    let session;
    try {
      session = await this.getVestingBrowserSession(options);
    } catch (error: any) {
      this.failSpinner("Failed to deposit vesting validator tokens", error.message || error);
      return;
    }

    this.startSpinner("Confirm the transaction in your browser wallet...");

    try {
      const readClient = await this.getReadOnlyVestingClient(options);
      const vesting = await this.resolveBeneficiaryVesting(readClient, options);
      const amount = this.parseAmount(options.amount);

      const {to, data} = buildTx(abi.VESTING_ABI as any, vesting, "vestingValidatorDeposit", [
        options.walletAddress,
        amount,
      ]);

      const receipt = await session.sendTransaction({
        to,
        data,
        label: `Deposit ${this.formatAmount(amount)} to validator wallet`,
      });

      this.succeedSpinner("Vesting validator deposit successful!", {
        transactionHash: receipt.transactionHash,
        vesting,
        wallet: options.walletAddress,
        amount: this.formatAmount(amount),
        blockNumber: receipt.blockNumber.toString(),
        gasUsed: receipt.gasUsed.toString(),
      });
    } catch (error: any) {
      this.failSpinner("Failed to deposit vesting validator tokens", error.message || error);
    } finally {
      await session.close();
    }
  }
}
