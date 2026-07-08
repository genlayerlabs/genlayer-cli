import {VestingAction, VestingConfig} from "./VestingAction";
import {abi} from "genlayer-js";
import {buildTx} from "../../lib/wallet/txBuilders";

export interface VestingWithdrawOptions extends VestingConfig {
  amount: string;
}

export class VestingWithdrawAction extends VestingAction {
  constructor() {
    super();
  }

  async execute(options: VestingWithdrawOptions): Promise<void> {
    if (this.isBrowserWallet(options)) {
      return this.executeWithBrowserWallet(options);
    }

    this.startSpinner("Withdrawing vested tokens...");

    try {
      const client = await this.getVestingClient(options);
      const amount = this.parseAmount(options.amount);
      const vesting = await this.resolveBeneficiaryVesting(client, options);

      this.setSpinnerText(`Withdrawing ${this.formatAmount(amount)} from vesting ${vesting}...`);

      const result = await client.vestingWithdraw({
        vesting,
        amount,
      });

      const output = {
        transactionHash: result.transactionHash,
        vesting: result.vesting,
        beneficiary: result.beneficiary,
        amount: result.amount,
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
      };

      this.succeedSpinner("Vesting withdrawal successful!", output);
    } catch (error: any) {
      this.failSpinner("Failed to withdraw vested tokens", error.message || error);
    }
  }

  private async executeWithBrowserWallet(options: VestingWithdrawOptions): Promise<void> {
    let session;
    try {
      session = await this.getVestingBrowserSession(options);
    } catch (error: any) {
      this.failSpinner("Failed to withdraw vested tokens", error.message || error);
      return;
    }

    this.startSpinner("Confirm the transaction in your browser wallet...");

    try {
      const readClient = await this.getReadOnlyVestingClient(options);
      const vesting = await this.resolveBeneficiaryVesting(readClient, options);
      const amount = this.parseAmount(options.amount);

      const {to, data} = buildTx(abi.VESTING_ABI as any, vesting, "vestingWithdraw", [amount]);

      const receipt = await session.sendTransaction({
        to,
        data,
        label: `Withdraw ${this.formatAmount(amount)} from vesting`,
      });

      this.succeedSpinner("Vesting withdrawal successful!", {
        transactionHash: receipt.transactionHash,
        vesting,
        beneficiary: session.signerAddress,
        amount: this.formatAmount(amount),
        blockNumber: receipt.blockNumber.toString(),
        gasUsed: receipt.gasUsed.toString(),
      });
    } catch (error: any) {
      this.failSpinner("Failed to withdraw vested tokens", error.message || error);
    } finally {
      await session.close();
    }
  }
}
