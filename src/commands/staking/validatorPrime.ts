import {StakingAction, StakingConfig} from "./StakingAction";
import type {Address} from "genlayer-js/types";
import chalk from "chalk";

export interface ValidatorPrimeOptions extends StakingConfig {
  validator: string;
}

export class ValidatorPrimeAction extends StakingAction {
  constructor() {
    super();
  }

  async execute(options: ValidatorPrimeOptions): Promise<void> {
    this.startSpinner("Priming validator...");

    try {
      const client = await this.getStakingClient(options);

      this.setSpinnerText(`Priming validator ${options.validator}...`);

      const result = await client.validatorPrime({validator: options.validator as Address});

      const output = {
        transactionHash: result.transactionHash,
        validator: options.validator,
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
      };

      this.succeedSpinner("Validator primed for next epoch!", output);
    } catch (error: any) {
      this.failSpinner("Failed to prime validator", error.message || error);
    }
  }

  async primeAll(options: StakingConfig): Promise<void> {
    this.startSpinner("Fetching validators...");

    try {
      const client = await this.getStakingClient(options);

      // Get all validators from tree
      this.setSpinnerText("Fetching validators...");
      const allValidators = await this.getAllValidatorsFromTree(options);

      this.stopSpinner();
      console.log(`\nPriming ${allValidators.length} validators:\n`);

      let succeeded = 0;
      let skipped = 0;

      for (const addr of allValidators) {
        process.stdout.write(`  ${addr} ... `);

        try {
          const result = await client.validatorPrime({validator: addr});
          console.log(chalk.green(`primed ${result.transactionHash}`));
          succeeded++;
        } catch (error: any) {
          const msg = error.message || String(error);
          const shortErr = msg.length > 60 ? msg.slice(0, 57) + "..." : msg;
          console.log(chalk.gray(`skipped: ${shortErr}`));
          skipped++;
        }
      }

      console.log(`\n${chalk.green(`${succeeded} primed`)}, ${chalk.gray(`${skipped} skipped`)}\n`);
    } catch (error: any) {
      this.failSpinner("Failed to prime validators", error.message || error);
    }
  }
}
