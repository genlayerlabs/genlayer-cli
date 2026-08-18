import {VestingAction, VestingConfig} from "./VestingAction";
import type {Address} from "genlayer-js/types";
import type {VestingClient} from "./vestingTypes";

export interface VestingValidatorDepositOptions extends VestingConfig {
  walletAddress: string;
  amount: string;
  force?: boolean;
}

export class VestingValidatorDepositAction extends VestingAction {
  constructor() {
    super();
  }

  /**
   * Pre-submit checks for a vesting-funded top-up deposit:
   *  1. Mixing hard-guard: the target wallet must have been created by THIS
   *     vesting contract (`isValidatorWallet`). A liquid, wallet-funded
   *     validator's wallet is not owned by the vesting contract, so depositing
   *     vesting tokens would revert on-chain — fail fast with actionable copy.
   *     No `--force` override.
   *  2. Self-stake minimum: resulting self-stake is the current committed
   *     self-stake plus still-pending self-stake deposits plus the new amount.
   *     Block unless `--force`, epoch-0 aware.
   */
  private async preflight(
    client: VestingClient,
    vesting: Address,
    wallet: Address,
    amount: bigint,
    force?: boolean,
  ): Promise<void> {
    const isOwned = await client.isValidatorWallet(vesting, wallet);
    if (!isOwned) {
      throw new Error(
        "This wallet was not created by this vesting contract (it's a liquid, wallet-funded " +
          "validator). You can't add vesting tokens. Use `genlayer staking validator-deposit` from " +
          "the owner wallet instead.",
      );
    }

    // Advisory min check (the mixing guard above is already enforced) — skip
    // if the chain can't report validator/epoch state.
    let info, epochInfo;
    try {
      [info, epochInfo] = await Promise.all([
        client.getValidatorInfo(wallet),
        client.getEpochInfo(),
      ]);
    } catch {
      return;
    }
    const pendingSelfStakeRaw = info.pendingDeposits.reduce((sum, d) => sum + d.stakeRaw, 0n);
    const resultingSelfStakeRaw = info.vStakeRaw + pendingSelfStakeRaw + amount;
    this.assertOrWarnSelfStakeMinimum({
      currentEpoch: epochInfo.currentEpoch,
      minStakeRaw: epochInfo.validatorMinStakeRaw,
      minStakeFormatted: epochInfo.validatorMinStake,
      resultingSelfStakeRaw,
      resultingSelfStakeFormatted: this.formatAmount(resultingSelfStakeRaw),
      force,
    });
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

      await this.preflight(client, vesting, options.walletAddress as Address, amount, options.force);

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
      const client = this.getBrowserVestingClient(options, session);
      const vesting = await this.resolveBeneficiaryVesting(client, options);
      const amount = this.parseAmount(options.amount);

      await this.preflight(client, vesting, options.walletAddress as Address, amount, options.force);

      session.setNextLabel(`Deposit ${this.formatAmount(amount)} to validator wallet`);
      const result = await client.vestingValidatorDeposit({
        vesting,
        wallet: options.walletAddress as Address,
        amount,
      });

      this.succeedSpinner("Vesting validator deposit successful!", {
        transactionHash: result.transactionHash,
        vesting,
        wallet: options.walletAddress,
        amount: this.formatAmount(amount),
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
      });
    } catch (error: any) {
      this.failSpinner("Failed to deposit vesting validator tokens", error.message || error);
    } finally {
      await session.close();
    }
  }
}
