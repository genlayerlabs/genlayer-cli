import {VestingAction, VestingConfig} from "../vesting/VestingAction";
import {resolveNetwork} from "../../lib/actions/BaseAction";
import type {Address} from "genlayer-js/types";
import type {VestingClient} from "../vesting/vestingTypes";
import {vestingAvailableToStake} from "../../lib/vesting/availableToStake";
import {readDescriptor, descriptorPath, isPidAlive} from "../../lib/wallet/sessionDescriptor";
import {WalletSessionClient} from "../../lib/wallet/sessionClient";
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
  /** Revoked contracts can no longer stake, so their available-to-stake is 0. */
  revoked: boolean;
  /** Self-stake committed principal (cost basis, summed over its validator wallets). */
  selfStakeRaw: bigint;
  /** Delegated committed principal (cost basis, summed over the validator set). */
  delegatedRaw: bigint;
  /** Committed principal (self-stake + delegated); informational only. */
  committedRaw: bigint;
  /** AUTHORITATIVE on-chain figure: the contract's live native balance (0 if revoked). */
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
 * principal, and the authoritative available-to-stake (the contract's live
 * on-chain balance). Never signs, never writes, and never unlocks the keystore
 * — a read only needs the address.
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
   * Resolve the address to inspect without ever unlocking a keystore. Precedence
   * mirrors resolveWalletMode so "who am I" follows the same connect-once rule as
   * "how do I sign":
   *   1. --beneficiary — explicit address override (pure read, no wallet).
   *   2. --account <name> — explicit keystore selection wins over a session.
   *   3. a live browser-wallet session's connected address — when a session is up
   *      (resolveWalletMode → "browser") that IS your active identity.
   *   4. the active account's keystore address (file read only, no password).
   *   5. last resort: a live session even if the mode wasn't "browser".
   */
  private async resolveAddress(options: BalancesOptions): Promise<Address> {
    if (options.beneficiary) {
      return options.beneficiary as Address;
    }
    if (options.account) {
      return await this.getSignerAddress();
    }

    if (this.resolveWalletMode() === "browser") {
      const sessionAddress = await this.liveSessionAddress();
      if (sessionAddress) {
        return sessionAddress;
      }
    }

    try {
      return await this.getSignerAddress();
    } catch (error) {
      const sessionAddress = await this.liveSessionAddress();
      if (sessionAddress) {
        return sessionAddress;
      }
      throw new Error(
        "No address to inspect. Pass --beneficiary <address>, select an account, or connect a wallet.",
      );
    }
  }

  /**
   * The connected address of a live browser-wallet session, or null. Read-only:
   * pings an already-running daemon and reads its live state (as `wallet status`
   * does) — never starts a daemon or opens a tab. The descriptor's own `address`
   * field is null until connect and not reliably rewritten, so we query state.
   */
  private async liveSessionAddress(): Promise<Address | null> {
    try {
      const descriptor = readDescriptor(descriptorPath(this));
      if (!descriptor) {
        return null;
      }
      const client = new WalletSessionClient(descriptor);
      if (!(isPidAlive(descriptor.pid) && (await client.ping()))) {
        return null;
      }
      const state = await client.state().catch(() => null);
      return state?.connected && state.address ? (state.address as Address) : null;
    } catch {
      return null;
    }
  }

  private async computeVestingSummary(
    client: VestingClient,
    vesting: Address,
    activeValidators: Address[],
  ): Promise<VestingBalanceSummary> {
    const state = await client.getVestingState(vesting);

    // Self-stake committed principal: sum the cost-basis deposits across this
    // vesting's own validator wallets (see vesting validatorList).
    const wallets = await client.getValidatorWallets(vesting);
    let selfStakeRaw = 0n;
    for (const wallet of wallets) {
      const deposited = await client.validatorDeposited(vesting, wallet);
      selfStakeRaw += typeof deposited === "bigint" ? deposited : this.parseAmount(String(deposited));
    }

    // Delegated committed principal: sum the cost-basis the vesting deposited
    // delegating to each active validator (see execute() for the one-shot set).
    // This on-chain principal getter is consistent with the balance identity
    // used below (balance = deposits − withdrawals + rewards − losses).
    let delegatedRaw = 0n;
    for (const validator of activeValidators) {
      delegatedRaw += await client.vestingDepositedPerValidator(vesting, validator);
    }

    const committedRaw = selfStakeRaw + delegatedRaw;

    // AUTHORITATIVE available-to-stake: the contract's live native balance (0
    // once revoked). Vesting.sol enforces every stake path against
    // address(this).balance, so this — not vested/withdrawn/committed math — is
    // the real cap; it already nets withdrawals + committed principal and
    // includes still-locked tokens. The committed figures above are purely
    // informational now.
    const availableToStakeRaw = await vestingAvailableToStake(client, vesting, state.revoked);

    return {
      vesting,
      name: state.name || "",
      totalRaw: state.totalAmountRaw,
      vestedRaw: state.vestedAmountRaw,
      lockedRaw: state.unvestedAmountRaw,
      withdrawableRaw: state.withdrawableAmountRaw,
      totalWithdrawnRaw: state.totalWithdrawnRaw,
      revoked: state.revoked,
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
      const availableValue = v.revoked
        ? `${fmt(v.availableToStakeRaw)} ${chalk.gray("(revoked — staking disabled)")}`
        : fmt(v.availableToStakeRaw);
      table.push(
        ["Total", fmt(v.totalRaw)],
        ["Vested", fmt(v.vestedRaw)],
        ["Locked (unvested)", fmt(v.lockedRaw)],
        ["Withdrawable", fmt(v.withdrawableRaw)],
        ["Total withdrawn", fmt(v.totalWithdrawnRaw)],
        ["Committed principal (staked)", fmt(v.committedRaw)],
        [chalk.gray("  self-stake"), chalk.gray(fmt(v.selfStakeRaw))],
        [chalk.gray("  delegated"), chalk.gray(fmt(v.delegatedRaw))],
        [chalk.bold("Available to stake"), chalk.bold(availableValue)],
      );
      console.log(chalk.bold(`Vesting ${v.vesting}`) + (v.name ? `  ${chalk.gray(v.name)}` : ""));
      console.log(table.toString());
      console.log("");
    });

    console.log(
      chalk.gray("Available to stake is the vesting contract's live on-chain balance (0 once revoked)."),
    );
    console.log(
      chalk.gray("Committed principal is the staked cost basis (self-stake + delegated), shown for reference."),
    );
    console.log(
      chalk.gray(`Total: ${summary.vestings.length} vesting contract${summary.vestings.length === 1 ? "" : "s"}`),
    );
    console.log("");
  }
}
