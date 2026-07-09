import {VestingAction, VestingConfig} from "../vesting/VestingAction";
import {resolveNetwork} from "../../lib/actions/BaseAction";
import type {Address} from "genlayer-js/types";
import type {VestingClient} from "../vesting/vestingTypes";
import {readDescriptor, descriptorPath} from "../../lib/wallet/sessionDescriptor";
import {formatEther} from "viem";
import Table from "cli-table3";
import chalk from "chalk";

export interface BalancesOptions extends VestingConfig {
  beneficiary?: string;
}

/** Per-vesting-contract holdings, all amounts kept as raw wei bigints. */
interface VestingBalanceSummary {
  vesting: Address;
  name: string;
  totalRaw: bigint;
  vestedRaw: bigint;
  /** Unvested (still locked by schedule). */
  lockedRaw: bigint;
  withdrawableRaw: bigint;
  totalWithdrawnRaw: bigint;
  /** Self-stake committed from this vesting (sum over its validator wallets). */
  selfStakeRaw: bigint;
  /** Delegated committed from this vesting (active + pending, over the validator set). */
  delegatedRaw: bigint;
  committedRaw: bigint;
  /** DERIVED estimate: vested − withdrawn − committed, floored at 0. */
  availableToStakeRaw: bigint;
}

interface BalancesSummary {
  network: string;
  chainId: number;
  address: Address;
  walletBalanceRaw: bigint;
  vestings: VestingBalanceSummary[];
}

/**
 * Read-only "what do I hold" view: wallet GEN + per-vesting totals, committed
 * stake, and a derived available-to-stake estimate. Never signs, never writes,
 * and never unlocks the keystore — a read only needs the address.
 */
export class BalancesAction extends VestingAction {
  constructor() {
    super();
  }

  async execute(options: BalancesOptions): Promise<void> {
    this.startSpinner("Fetching balances...");

    try {
      const client = await this.getReadOnlyVestingClient(options);
      const address = await this.resolveAddress(options);

      // Label with the ACTIVE network alias + real chainId, mirroring `account
      // show`. chain.name is the BASE chain's name for custom networks, so it
      // would mislabel — use the alias the user set and network.id instead.
      const networkKey = options.network || this.getConfig().network;
      const networkAlias = networkKey || "localnet";
      const chain = resolveNetwork(networkKey, this.getCustomNetworks());

      this.setSpinnerText(`Fetching wallet balance for ${address}...`);
      const walletBalanceRaw = await client.getBalance({address});

      this.setSpinnerText(`Looking up vesting contracts for ${address}...`);
      const vestingAddresses = await client.getBeneficiaryVestings(
        address,
        this.getFactoryLookupOptions(options),
      );

      const vestings: VestingBalanceSummary[] = [];
      if (vestingAddresses.length > 0) {
        // The active validator set is global; fetch it once and reuse across
        // every vesting. Committed-delegation lookup is O(#vestings × #validators).
        this.setSpinnerText("Enumerating validator set...");
        const activeValidators = await client.getActiveValidators();

        for (let i = 0; i < vestingAddresses.length; i++) {
          this.setSpinnerText(
            `Computing balances for vesting ${i + 1}/${vestingAddresses.length} ` +
              `(scanning ${activeValidators.length} validator${activeValidators.length === 1 ? "" : "s"})...`,
          );
          vestings.push(await this.computeVestingSummary(client, vestingAddresses[i], activeValidators));
        }
      }

      this.stopSpinner();

      this.renderSummary({
        network: networkAlias,
        chainId: chain.id,
        address,
        walletBalanceRaw,
        vestings,
      });
    } catch (error: any) {
      this.failSpinner("Failed to fetch balances", error.message || error);
    }
  }

  /**
   * Resolve the address to inspect without ever unlocking a keystore:
   *   1. --beneficiary (pure read, no wallet needed)
   *   2. the active account's keystore address (file read only, no password)
   *   3. a live browser-wallet session's connected address, if one exists
   *      (reads the on-disk descriptor only — never starts a daemon or a tab).
   */
  private async resolveAddress(options: BalancesOptions): Promise<Address> {
    if (options.beneficiary) {
      return options.beneficiary as Address;
    }

    try {
      return await this.getSignerAddress();
    } catch (error) {
      if (this.isBrowserWallet(options)) {
        const descriptor = readDescriptor(descriptorPath(this));
        if (descriptor?.address) {
          return descriptor.address as Address;
        }
      }
      throw new Error(
        "No address to inspect. Pass --beneficiary <address>, select an account, or connect a wallet.",
      );
    }
  }

  private async computeVestingSummary(
    client: VestingClient,
    vesting: Address,
    activeValidators: Address[],
  ): Promise<VestingBalanceSummary> {
    const state = await client.getVestingState(vesting);

    // Self-stake committed from this vesting: sum deposits across its validator
    // wallets (see vesting validatorList).
    const wallets = await client.getValidatorWallets(vesting);
    let selfStakeRaw = 0n;
    for (const wallet of wallets) {
      const deposited = await client.validatorDeposited(vesting, wallet);
      selfStakeRaw += typeof deposited === "bigint" ? deposited : this.parseAmount(String(deposited));
    }

    // Delegated committed from this vesting: active stake plus everything still
    // tied up (pending deposits activating + pending withdrawals unbonding),
    // over the active validator set (see execute()). getStakeInfo takes the
    // delegator first — here the vesting contract is the delegator.
    let delegatedRaw = 0n;
    for (const validator of activeValidators) {
      const info = await client.getStakeInfo(vesting, validator);
      const pendingDeposits = info.pendingDeposits.reduce((sum, d) => sum + d.stakeRaw, 0n);
      const pendingWithdrawals = info.pendingWithdrawals.reduce((sum, w) => sum + w.stakeRaw, 0n);
      delegatedRaw += info.stakeRaw + pendingDeposits + pendingWithdrawals;
    }

    const committedRaw = selfStakeRaw + delegatedRaw;
    const vestedRaw = state.vestedAmountRaw;
    const totalWithdrawnRaw = state.totalWithdrawnRaw;

    // DERIVED estimate — the contract/SDK exposes no direct "available to stake"
    // getter (withdraw/delegate take an explicit --amount). Floor at 0 because
    // committed can exceed vested when unvested tokens were also staked.
    const availableRaw = vestedRaw - totalWithdrawnRaw - committedRaw;
    const availableToStakeRaw = availableRaw > 0n ? availableRaw : 0n;

    return {
      vesting,
      name: state.name || "",
      totalRaw: state.totalAmountRaw,
      vestedRaw,
      lockedRaw: state.unvestedAmountRaw,
      withdrawableRaw: state.withdrawableAmountRaw,
      totalWithdrawnRaw,
      selfStakeRaw,
      delegatedRaw,
      committedRaw,
      availableToStakeRaw,
    };
  }

  private renderSummary(summary: BalancesSummary): void {
    const fmt = (raw: bigint) => `${formatEther(raw)} GEN`;

    console.log("");
    console.log(chalk.bold("GenLayer balances"));
    console.log(chalk.gray(`Network: ${summary.network} (chainId ${summary.chainId})`));
    console.log(chalk.gray(`Address: ${summary.address}`));
    console.log("");
    console.log(`${chalk.cyan("Wallet")}: ${fmt(summary.walletBalanceRaw)}`);
    console.log("");

    if (summary.vestings.length === 0) {
      console.log(chalk.yellow(`No vesting contracts found for ${summary.address}`));
      console.log("");
      return;
    }

    summary.vestings.forEach(v => {
      const table = new Table({
        head: [chalk.cyan("Metric"), chalk.cyan("Amount")],
        style: {head: [], border: []},
        wordWrap: true,
      });
      table.push(
        ["Total", fmt(v.totalRaw)],
        ["Vested", fmt(v.vestedRaw)],
        ["Locked (unvested)", fmt(v.lockedRaw)],
        ["Withdrawable", fmt(v.withdrawableRaw)],
        ["Total withdrawn", fmt(v.totalWithdrawnRaw)],
        ["Committed (staked)", fmt(v.committedRaw)],
        [chalk.gray("  self-stake"), chalk.gray(fmt(v.selfStakeRaw))],
        [chalk.gray("  delegated"), chalk.gray(fmt(v.delegatedRaw))],
        [chalk.bold("Available to stake ≈"), chalk.bold(fmt(v.availableToStakeRaw))],
      );
      console.log(chalk.bold(`Vesting ${v.vesting}`) + (v.name ? `  ${chalk.gray(v.name)}` : ""));
      console.log(table.toString());
      console.log("");
    });

    console.log(
      chalk.gray("≈ Available to stake is a DERIVED estimate: vested − withdrawn − committed"),
    );
    console.log(
      chalk.gray("  (floored at 0), scanned over the active validator set — not a direct on-chain value."),
    );
    console.log(
      chalk.gray(`Total: ${summary.vestings.length} vesting contract${summary.vestings.length === 1 ? "" : "s"}`),
    );
    console.log("");
  }
}
