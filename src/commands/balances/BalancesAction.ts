import {VestingAction, VestingConfig} from "../vesting/VestingAction";
import {resolveNetwork} from "../../lib/actions/BaseAction";
import type {Address} from "genlayer-js/types";
import type {VestingClient} from "../vesting/vestingTypes";
import {vestingAvailableToStake} from "../../lib/vesting/availableToStake";
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
        // The validator set is global; fetch it once and reuse across every
        // vesting. Committed-delegation lookup is O(#vestings × #validators).
        // A vesting can hold committed principal against validators that later
        // left the active set (quarantined/banned) — scanning only the active
        // set would under-count committed and thus mis-state available-to-stake,
        // so union active + quarantined + banned.
        //
        // Studio-based networks have no staking contract, so the validator set
        // (and thus delegated committed principal) is unavailable — the SDK's
        // staking reads throw there. Degrade to an empty set so `balances` still
        // reports wallet + vesting holdings instead of failing outright; on
        // studio there is no delegation, so delegated principal is 0 anyway.
        const validatorSet = this.isStakingAvailable(chain)
          ? await this.getKnownValidatorSet(client)
          : [];

        for (let i = 0; i < vestingAddresses.length; i++) {
          this.setSpinnerText(
            `Computing balances for vesting ${i + 1}/${vestingAddresses.length} ` +
              `(scanning ${validatorSet.length} validator${validatorSet.length === 1 ? "" : "s"})...`,
          );
          vestings.push(await this.computeVestingSummary(client, vestingAddresses[i], validatorSet));
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
   * Resolve the address to inspect without ever unlocking a keystore, via the
   * shared connect-once resolver. `--beneficiary` is the explicit override; a
   * live browser session otherwise wins over the keystore default.
   */
  private async resolveAddress(options: BalancesOptions): Promise<Address> {
    return this.resolveActiveIdentity(options, options.beneficiary);
  }

  /**
   * Whether the resolved network has a usable staking contract. Mirrors the
   * SDK's own guard (missing or zero address ⇒ unsupported), so studio-based
   * networks — which carry no staking contract — are detected up front and the
   * validator-set scan is skipped rather than left to throw mid-read.
   */
  private isStakingAvailable(chain: {stakingContract?: {address?: string} | null}): boolean {
    const address = chain.stakingContract?.address;
    return !!address && address !== "0x0000000000000000000000000000000000000000";
  }

  /**
   * The full set of validators a vesting could have committed principal to:
   * active + quarantined + banned, de-duplicated (case-insensitively, keeping
   * the first-seen casing). Committed principal survives a validator leaving the
   * active set, so an active-only scan would under-count it.
   */
  private async getKnownValidatorSet(client: VestingClient): Promise<Address[]> {
    this.setSpinnerText("Enumerating validator set...");
    const [active, quarantined, banned] = await Promise.all([
      client.getActiveValidators(),
      client.getQuarantinedValidatorsDetailed(),
      client.getBannedValidators(),
    ]);

    const seen = new Map<string, Address>();
    const add = (addr: Address) => {
      const key = addr.toLowerCase();
      if (!seen.has(key)) seen.set(key, addr);
    };
    active.forEach(add);
    quarantined.forEach(v => add(v.validator));
    banned.forEach(v => add(v.validator));
    return Array.from(seen.values());
  }

  private async computeVestingSummary(
    client: VestingClient,
    vesting: Address,
    knownValidators: Address[],
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
    // delegating to each known validator (see execute() for the one-shot set,
    // which unions active + quarantined + banned). This on-chain principal
    // getter is consistent with the balance identity used below
    // (balance = deposits − withdrawals + rewards − losses).
    let delegatedRaw = 0n;
    for (const validator of knownValidators) {
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
