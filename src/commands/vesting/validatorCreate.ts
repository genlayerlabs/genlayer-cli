import {VestingAction, VestingConfig} from "./VestingAction";
import type {Address} from "genlayer-js/types";
import type {VestingClient} from "./vestingTypes";

export interface VestingValidatorCreateOptions extends VestingConfig {
  operator: string;
  amount: string;
  force?: boolean;
}

export class VestingValidatorCreateAction extends VestingAction {
  constructor() {
    super();
  }

  /**
   * A vesting-backed create always spins up a NEW wallet owned by the vesting
   * contract, so the self-stake source is fixed and the resulting self-stake is
   * exactly the create amount. Warn/block if that is below the on-chain
   * minimum, and surface the source note.
   */
  private async preflight(client: VestingClient, amount: bigint, force?: boolean): Promise<void> {
    this.logInfo(
      "Creating a vesting-funded validator. Self-stake source is fixed — you won't be able to add " +
        "liquid self-stake later.",
    );
    // Advisory min check — skip if the chain can't report the minimum.
    let epochInfo;
    try {
      epochInfo = await client.getEpochInfo();
    } catch {
      return;
    }
    this.assertOrWarnSelfStakeMinimum({
      currentEpoch: epochInfo.currentEpoch,
      minStakeRaw: epochInfo.validatorMinStakeRaw,
      minStakeFormatted: epochInfo.validatorMinStake,
      resultingSelfStakeRaw: amount,
      resultingSelfStakeFormatted: this.formatAmount(amount),
      force,
    });
  }

  async execute(options: VestingValidatorCreateOptions): Promise<void> {
    if (this.isBrowserWallet(options)) {
      return this.executeWithBrowserWallet(options);
    }

    this.startSpinner("Creating vesting-backed validator...");

    try {
      const client = await this.getVestingClient(options);
      const amount = this.parseAmount(options.amount);
      const vesting = await this.resolveBeneficiaryVesting(client, options);

      await this.preflight(client, amount, options.force);

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

  private async executeWithBrowserWallet(options: VestingValidatorCreateOptions): Promise<void> {
    let session;
    try {
      session = await this.getVestingBrowserSession(options);
    } catch (error: any) {
      this.failSpinner("Failed to create vesting-backed validator", error.message || error);
      return;
    }

    this.startSpinner("Confirm the transaction in your browser wallet...");

    try {
      const client = this.getBrowserVestingClient(options, session);
      const vesting = await this.resolveBeneficiaryVesting(client, options);
      const amount = this.parseAmount(options.amount);

      await this.preflight(client, amount, options.force);

      session.setNextLabel("Create vesting validator");
      const result = await client.vestingValidatorJoin({
        vesting,
        operator: options.operator as Address,
        amount,
      });

      // The vestingValidatorJoin result does not carry the wallet address; the
      // vesting contract tracks its wallets, so the newest entry is the one
      // just created.
      let validatorWallet: string;
      try {
        const wallets = await client.getValidatorWallets(vesting);
        validatorWallet = wallets[wallets.length - 1];
      } catch {
        validatorWallet = "(read getValidatorWallets to inspect)";
      }

      this.succeedSpinner("Vesting-backed validator created!", {
        transactionHash: result.transactionHash,
        vesting,
        validatorWallet,
        operator: options.operator,
        amount: this.formatAmount(amount),
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
      });
    } catch (error: any) {
      this.failSpinner("Failed to create vesting-backed validator", error.message || error);
    } finally {
      await session.close();
    }
  }
}
