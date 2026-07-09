import {StakingAction, StakingConfig} from "./StakingAction";
import type {Address, GenLayerClient, GenLayerChain, StakingTransactionResult} from "genlayer-js/types";
import chalk from "chalk";

/**
 * `validatorPrime` exists on the client at runtime but is missing from the
 * installed genlayer-js StakingActions .d.ts — this alias bridges that type gap.
 */
type ClientWithPrime = GenLayerClient<GenLayerChain> & {
  validatorPrime(o: {validator: Address}): Promise<StakingTransactionResult>;
};

export interface ValidatorPrimeOptions extends StakingConfig {
  validator: string;
}

export class ValidatorPrimeAction extends StakingAction {
  constructor() {
    super();
  }

  async execute(options: ValidatorPrimeOptions): Promise<void> {
    if (this.isBrowserWallet(options)) {
      return this.executeWithBrowserWallet(options);
    }

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

  private async executeWithBrowserWallet(options: ValidatorPrimeOptions): Promise<void> {
    let session;
    try {
      session = await this.getBrowserWalletSession(options, "validator-join");
    } catch (error: any) {
      this.failSpinner("Failed to prime validator", error.message || error);
      return;
    }

    this.startSpinner("Confirm the transaction in your browser wallet...");
    try {
      const client = this.getBrowserStakingClient(options, session) as ClientWithPrime;

      this.log(`  From (browser wallet): ${session.signerAddress}`);
      session.setNextLabel(`Prime ${options.validator}`);
      const result = await client.validatorPrime({validator: options.validator as Address});

      this.succeedSpinner("Validator primed for next epoch!", {
        transactionHash: result.transactionHash,
        validator: options.validator,
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
      });
    } catch (error: any) {
      this.failSpinner("Failed to prime validator", error.message || error);
    } finally {
      await session.close();
    }
  }

  async primeAll(options: StakingConfig): Promise<void> {
    if (this.isBrowserWallet(options)) {
      return this.primeAllWithBrowserWallet(options);
    }

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

  private async primeAllWithBrowserWallet(options: StakingConfig): Promise<void> {
    let session;
    try {
      session = await this.getBrowserWalletSession(options, "validator-join");
    } catch (error: any) {
      this.failSpinner("Failed to prime validators", error.message || error);
      return;
    }

    try {
      this.startSpinner("Fetching validators...");
      const allValidators = await this.getAllValidatorsFromTree(options);
      const client = this.getBrowserStakingClient(options, session) as ClientWithPrime;

      this.stopSpinner();
      console.log(`\nPriming ${allValidators.length} validators:\n`);

      let succeeded = 0;
      let skipped = 0;

      for (const addr of allValidators) {
        process.stdout.write(`  ${addr} ... `);

        try {
          session.setNextLabel(`Prime ${addr}`);
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
    } finally {
      await session.close();
    }
  }
}
