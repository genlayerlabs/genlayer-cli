import {StakingAction, StakingConfig} from "./StakingAction";
import type {Address, GenLayerClient, GenLayerChain} from "genlayer-js/types";

export interface ValidatorDepositOptions extends StakingConfig {
  amount: string;
  validator: string;
  force?: boolean;
}

export class ValidatorDepositAction extends StakingAction {
  constructor() {
    super();
  }

  /**
   * Pre-submit checks for a liquid (wallet-funded) top-up deposit:
   *  1. Mixing hard-guard: the target wallet must be owned by the signing EOA.
   *     A vesting-funded validator's wallet is owned by the vesting contract,
   *     so a liquid deposit would revert on-chain (OwnableUnauthorizedAccount)
   *     — fail fast with actionable copy instead. No `--force` override.
   *  2. Self-stake minimum: the resulting self-stake is the current committed
   *     self-stake plus still-pending self-stake deposits plus the new amount.
   *     Block unless `--force`, epoch-0 aware.
   */
  private async preflight(
    client: GenLayerClient<GenLayerChain>,
    validatorWallet: Address,
    signerAddress: Address,
    amount: bigint,
    force?: boolean,
  ): Promise<void> {
    const info = await client.getValidatorInfo(validatorWallet);

    // Mixing guard — a liquid deposit into a vesting-owned wallet reverts
    // on-chain; fail fast with guidance. This is a hard guard, always enforced.
    if (info.owner.toLowerCase() !== signerAddress.toLowerCase()) {
      throw new Error(
        "This validator wallet is owned by a vesting contract (vesting-funded self-stake). " +
          "Self-stake source is fixed at creation — you can't add liquid (wallet) tokens. " +
          "Use `genlayer vesting validator-deposit` instead.",
      );
    }

    // The self-stake minimum is advisory. If the chain can't report it, skip
    // the check rather than blocking the deposit.
    let epochInfo;
    try {
      epochInfo = await client.getEpochInfo();
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

  async execute(options: ValidatorDepositOptions): Promise<void> {
    if (this.isBrowserWallet(options)) {
      return this.executeWithBrowserWallet(options);
    }

    this.startSpinner("Making validator deposit...");

    try {
      const amount = this.parseAmount(options.amount);
      const validatorWallet = options.validator as Address;

      // Route through the SDK's staking action rather than a raw viem
      // writeContract. The SDK's executeWrite pins `type: "legacy"` and does
      // manual nonce/gas + sign + sendRawTransaction, which the GenLayer
      // consensus RPC requires (it has no EIP-1559 fee support, so viem's
      // default fee/tx-type negotiation fails). The action forwards to the
      // ValidatorWallet's own `validatorDeposit`, preserving msg.sender ==
      // ValidatorWallet when it re-enters Staking.
      const client = await this.getStakingClient(options);
      const signerAddress = await this.getSignerAddress();

      await this.preflight(client, validatorWallet, signerAddress, amount, options.force);

      this.setSpinnerText(`Depositing ${this.formatAmount(amount)} to validator ${validatorWallet}...`);

      const result = await client.validatorDeposit({
        validator: validatorWallet,
        amount,
      });

      const output = {
        transactionHash: result.transactionHash,
        validator: validatorWallet,
        amount: this.formatAmount(amount),
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
      };

      this.succeedSpinner("Deposit successful!", output);
    } catch (error: any) {
      this.failSpinner("Failed to make deposit", error.message || error);
    }
  }

  private async executeWithBrowserWallet(options: ValidatorDepositOptions): Promise<void> {
    let session;
    try {
      session = await this.getBrowserWalletSession(options, "validator-join");
    } catch (error: any) {
      this.failSpinner("Failed to make deposit", error.message || error);
      return;
    }

    this.startSpinner("Confirm the transaction in your browser wallet...");
    try {
      const amount = this.parseAmount(options.amount);
      const validatorWallet = options.validator as Address;
      const client = this.getBrowserStakingClient(options, session);

      await this.preflight(client, validatorWallet, session.signerAddress as Address, amount, options.force);

      this.log(`  From (browser wallet): ${session.signerAddress}`);
      session.setNextLabel(`Deposit ${this.formatAmount(amount)} to validator`);
      const result = await client.validatorDeposit({
        validator: validatorWallet,
        amount,
      });

      this.succeedSpinner("Deposit successful!", {
        transactionHash: result.transactionHash,
        validator: validatorWallet,
        amount: this.formatAmount(amount),
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
      });
    } catch (error: any) {
      this.failSpinner("Failed to make deposit", error.message || error);
    } finally {
      await session.close();
    }
  }
}
