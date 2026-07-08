import {VestingAction, VestingConfig} from "./VestingAction";
import type {Address} from "genlayer-js/types";

export interface VestingValidatorCreateOptions extends VestingConfig {
  operator: string;
  amount: string;
}

export class VestingValidatorCreateAction extends VestingAction {
  constructor() {
    super();
  }

  async execute(options: VestingValidatorCreateOptions): Promise<void> {
    this.startSpinner("Creating vesting-backed validator...");

    try {
      const client = await this.getVestingClient(options);
      const amount = this.parseAmount(options.amount);
      const vesting = await this.resolveBeneficiaryVesting(client, options);

      this.setSpinnerText(`Creating validator with ${this.formatAmount(amount)} from vesting ${vesting}...`);

      const result = await client.vestingValidatorJoin({
        vesting,
        operator: options.operator as Address,
        amount,
      });

      // The join receipt does not carry the wallet address; the vesting
      // contract tracks its wallets, so the newest entry is the one created.
      let validatorWallet = result.validatorWallet || result.wallet;
      if (!validatorWallet) {
        try {
          const wallets = await client.getValidatorWallets(vesting);
          validatorWallet = wallets[wallets.length - 1];
        } catch {
          validatorWallet = "(read getValidatorWallets to inspect)";
        }
      }

      const output = {
        transactionHash: result.transactionHash,
        vesting,
        validatorWallet,
        operator: result.operator || options.operator,
        amount: result.amount || this.formatAmount(amount),
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
      };

      this.succeedSpinner("Vesting-backed validator created!", output);
    } catch (error: any) {
      this.failSpinner("Failed to create vesting-backed validator", error.message || error);
    }
  }
}
