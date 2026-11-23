import {VestingAction, VestingConfig} from "./VestingAction";
import type {Address} from "genlayer-js/types";
import Table from "cli-table3";
import chalk from "chalk";

export interface VestingValidatorListOptions extends VestingConfig {
  beneficiary?: string;
}

interface WalletState {
  wallet: Address;
  deposited: bigint | string;
}

export class VestingValidatorListAction extends VestingAction {
  constructor() {
    super();
  }

  private formatDeposited(value: bigint | string): string {
    return typeof value === "bigint" ? this.formatAmount(value) : value;
  }

  async execute(options: VestingValidatorListOptions): Promise<void> {
    this.startSpinner("Fetching vesting validator wallets...");

    try {
      const client = await this.getReadOnlyVestingClient(options);
      let vesting: Address;

      if (options.vesting) {
        vesting = options.vesting as Address;
      } else {
        const beneficiary = await this.resolveActiveIdentity(options, options.beneficiary);
        this.setSpinnerText(`Resolving vesting contract for ${beneficiary}...`);
        const vestings = await client.getBeneficiaryVestings(beneficiary, this.getFactoryLookupOptions(options));

        if (vestings.length === 0) {
          this.succeedSpinner("No vesting contracts found", {beneficiary, count: 0});
          return;
        }
        if (vestings.length > 1) {
          throw new Error(`Multiple vesting contracts found for beneficiary ${beneficiary}. Use --vesting <address>.`);
        }
        vesting = vestings[0];
      }

      this.setSpinnerText(`Fetching validator wallets for vesting ${vesting}...`);
      const wallets = await client.getValidatorWallets(vesting);

      if (wallets.length === 0) {
        this.succeedSpinner("No vesting validator wallets found", {vesting, count: 0});
        return;
      }

      const states: WalletState[] = await Promise.all(
        wallets.map(async (wallet) => ({
          wallet,
          deposited: await client.validatorDeposited(vesting, wallet),
        })),
      );

      this.stopSpinner();

      const table = new Table({
        head: [
          chalk.cyan("Vesting"),
          chalk.cyan("Validator Wallet"),
          chalk.cyan("Deposited"),
        ],
        style: {head: [], border: []},
        wordWrap: true,
      });

      states.forEach(({wallet, deposited}) => {
        table.push([
          vesting,
          wallet,
          this.formatDeposited(deposited),
        ]);
      });

      console.log("");
      console.log(table.toString());
      console.log("");
      console.log(chalk.gray(`Vesting: ${vesting}`));
      console.log(chalk.gray(`Total: ${states.length} validator wallet${states.length === 1 ? "" : "s"}`));
      console.log("");
    } catch (error: any) {
      this.failSpinner("Failed to list vesting validator wallets", error.message || error);
    }
  }
}
