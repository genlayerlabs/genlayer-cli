import {VestingAction, VestingConfig} from "./VestingAction";
import type {Address} from "genlayer-js/types";
import {abi} from "genlayer-js";
import {buildTx} from "../../lib/wallet/txBuilders";

export interface VestingDelegateOptions extends VestingConfig {
  validator: string;
  amount: string;
}

export class VestingDelegateAction extends VestingAction {
  constructor() {
    super();
  }

  async execute(options: VestingDelegateOptions): Promise<void> {
    if (this.isBrowserWallet(options)) {
      return this.executeWithBrowserWallet(options);
    }

    this.startSpinner("Delegating vesting tokens...");

    try {
      const client = await this.getVestingClient(options);
      const amount = this.parseAmount(options.amount);
      const vesting = await this.resolveBeneficiaryVesting(client, options);

      this.setSpinnerText(`Delegating ${this.formatAmount(amount)} from vesting ${vesting} to validator ${options.validator}...`);

      const result = await client.vestingDelegatorJoin({
        vesting,
        validator: options.validator as Address,
        amount,
      });

      const output = {
        transactionHash: result.transactionHash,
        vesting: result.vesting,
        validator: result.validator,
        beneficiary: result.beneficiary,
        amount: result.amount,
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
      };

      this.succeedSpinner("Vesting delegation successful!", output);
    } catch (error: any) {
      this.failSpinner("Failed to delegate vesting tokens", error.message || error);
    }
  }

  private async executeWithBrowserWallet(options: VestingDelegateOptions): Promise<void> {
    let session;
    try {
      session = await this.getVestingBrowserSession(options);
    } catch (error: any) {
      this.failSpinner("Failed to delegate vesting tokens", error.message || error);
      return;
    }

    this.startSpinner("Confirm the transaction in your browser wallet...");

    try {
      const readClient = await this.getReadOnlyVestingClient(options);
      const vesting = await this.resolveBeneficiaryVesting(readClient, options);
      const amount = this.parseAmount(options.amount);

      const {to, data} = buildTx(abi.VESTING_ABI as any, vesting, "vestingDelegatorJoin", [
        options.validator,
        amount,
      ]);

      const receipt = await session.sendTransaction({
        to,
        data,
        label: `Delegate ${this.formatAmount(amount)} to validator`,
      });

      this.succeedSpinner("Vesting delegation successful!", {
        transactionHash: receipt.transactionHash,
        vesting,
        validator: options.validator,
        beneficiary: session.signerAddress,
        amount: this.formatAmount(amount),
        blockNumber: receipt.blockNumber.toString(),
        gasUsed: receipt.gasUsed.toString(),
      });
    } catch (error: any) {
      this.failSpinner("Failed to delegate vesting tokens", error.message || error);
    } finally {
      await session.close();
    }
  }
}
