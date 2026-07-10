import {StakingAction, StakingConfig} from "./StakingAction";
import type {Address, ValidatorInfo} from "genlayer-js/types";
import Table from "cli-table3";
import chalk from "chalk";

// Epoch-related constants
const ACTIVATION_DELAY_EPOCHS = 2n;
const UNBONDING_PERIOD_EPOCHS = 7n;

export interface StakingInfoOptions extends StakingConfig {
  validator?: string;
  debug?: boolean;
  json?: boolean;
}

export class StakingInfoAction extends StakingAction {
  constructor() {
    super();
  }

  async getValidatorInfo(options: StakingInfoOptions): Promise<void> {
    this.startSpinner("Fetching validator info...");

    try {
      const client = await this.getReadOnlyStakingClient(options);
      const validatorAddress = await this.resolveActiveIdentity(options, options.validator);

      const isValidator = await client.isValidator(validatorAddress as Address);

      if (!isValidator) {
        this.failSpinner(`Address ${validatorAddress} is not a validator`);
        return;
      }

      const [info, epochInfo] = await Promise.all([
        client.getValidatorInfo(validatorAddress as Address),
        client.getEpochInfo(),
      ]);

      const currentEpoch = epochInfo.currentEpoch;

      const result: Record<string, any> = {
        ...(options.debug && {currentEpoch: currentEpoch.toString()}),
        validator: info.address,
        owner: info.owner,
        operator: info.operator,
        vStake: info.vStake,
        vShares: info.vShares.toString(),
        dStake: info.dStake,
        dShares: info.dShares.toString(),
        vDeposit: info.vDeposit,
        vWithdrawal: info.vWithdrawal,
        ePrimed: info.ePrimed.toString(),
        needsPriming: info.needsPriming,
        live: info.live,
        banned: info.banned ? info.bannedEpoch?.toString() : "Not banned",
        selfStakePendingDeposits: (() => {
          // In debug mode, show all deposits; otherwise filter to truly pending only
          const deposits = options.debug
            ? info.pendingDeposits
            : info.pendingDeposits.filter(d => d.epoch + ACTIVATION_DELAY_EPOCHS > currentEpoch);
          return deposits.length > 0
            ? deposits.map(d => {
                const depositEpoch = d.epoch;
                const activationEpoch = depositEpoch + ACTIVATION_DELAY_EPOCHS;
                const epochsUntilActive = activationEpoch - currentEpoch;
                const isActivated = epochsUntilActive <= 0n;
                return {
                  epoch: depositEpoch.toString(),
                  stake: d.stake,
                  shares: d.shares.toString(),
                  activatesAtEpoch: activationEpoch.toString(),
                  ...(options.debug
                    ? {status: isActivated ? "ACTIVATED" : `pending (${epochsUntilActive} epochs)`}
                    : {epochsRemaining: epochsUntilActive.toString()}),
                };
              })
            : options.debug ? `None (raw count: ${info.pendingDeposits.length})` : "None";
        })(),
        selfStakePendingWithdrawals:
          info.pendingWithdrawals.length > 0
            ? info.pendingWithdrawals.map(w => {
                const exitEpoch = w.epoch;
                const claimableEpoch = exitEpoch + UNBONDING_PERIOD_EPOCHS;
                const epochsUntilClaimable = claimableEpoch - currentEpoch;
                return {
                  epoch: exitEpoch.toString(),
                  shares: w.shares.toString(),
                  stake: w.stake,
                  claimableAtEpoch: claimableEpoch.toString(),
                  status:
                    epochsUntilClaimable <= 0n
                      ? "Claimable now"
                      : `Unbonding (${epochsUntilClaimable} epoch${epochsUntilClaimable > 1n ? "s" : ""} remaining)`,
                };
              })
            : "None",
      };

      // Add identity if set
      if (info.identity?.moniker) {
        result.identity = {
          moniker: info.identity.moniker,
          ...(info.identity.website && {website: info.identity.website}),
          ...(info.identity.description && {description: info.identity.description}),
          ...(info.identity.twitter && {twitter: info.identity.twitter}),
          ...(info.identity.telegram && {telegram: info.identity.telegram}),
          ...(info.identity.github && {github: info.identity.github}),
          ...(info.identity.email && {email: info.identity.email}),
          ...(info.identity.logoUri && {logoUri: info.identity.logoUri}),
        };
      }

      // --json: emit the exact object the code builds today, machine-readable.
      // No spinner decoration so the output is a clean JSON document.
      if (options.json) {
        this.stopSpinner();
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      const source = await this.detectSelfStakeSource(client, info.owner as Address);

      this.succeedSpinner("Validator info retrieved");
      this.renderValidatorInfo(info, result, epochInfo, source);
    } catch (error: any) {
      this.failSpinner("Failed to get validator info", error.message || error);
    }
  }

  /**
   * Best-effort liquid-vs-vesting label. A liquid validator's wallet is owned by
   * the signer EOA; a vesting-funded one is owned by the vesting contract. The
   * cheap distinguishing signal is whether the owner address has code. If the
   * probe isn't available/fails, degrade to "unknown" — the owner address is
   * shown regardless, so nothing is lost.
   */
  private async detectSelfStakeSource(client: any, owner: Address): Promise<string> {
    try {
      const getCode = client.getCode ?? client.getBytecode;
      if (typeof getCode !== "function") return "unknown";
      const code = await getCode.call(client, {address: owner});
      return code && code !== "0x" ? "vesting (owner is a contract)" : "liquid (wallet-owned)";
    } catch {
      return "unknown";
    }
  }

  /**
   * Clean grouped validator view. Every VALUE from the raw output is preserved
   * verbatim as a plain substring (addresses, "<n> GEN" amounts, moniker,
   * "Not banned", epoch numbers, the `live` boolean) so downstream greps keep
   * matching — only the layout changes. `live` is shown as an opaque contract
   * flag, never relabelled "active".
   */
  private renderValidatorInfo(
    info: ValidatorInfo,
    result: Record<string, any>,
    epochInfo: {currentEpoch: bigint; validatorMinStake: string; validatorMinStakeRaw: bigint},
    source: string,
  ): void {
    const currentEpoch = epochInfo.currentEpoch;
    const label = (s: string) => chalk.gray(s);

    console.log("");

    // Identity (only when set)
    if (info.identity?.moniker) {
      console.log(chalk.bold("Identity"));
      console.log(`  ${label("Moniker:")}     ${info.identity.moniker}`);
      if (info.identity.website) console.log(`  ${label("Website:")}     ${info.identity.website}`);
      if (info.identity.description) console.log(`  ${label("Description:")} ${info.identity.description}`);
      if (info.identity.twitter) console.log(`  ${label("Twitter:")}     ${info.identity.twitter}`);
      if (info.identity.telegram) console.log(`  ${label("Telegram:")}    ${info.identity.telegram}`);
      if (info.identity.github) console.log(`  ${label("GitHub:")}      ${info.identity.github}`);
      if (info.identity.email) console.log(`  ${label("Email:")}       ${info.identity.email}`);
      if (info.identity.logoUri) console.log(`  ${label("Logo URI:")}    ${info.identity.logoUri}`);
      console.log("");
    }

    // Addresses
    console.log(chalk.bold("Addresses"));
    console.log(`  ${label("Validator:")} ${info.address}`);
    console.log(`  ${label("Owner:")}     ${info.owner}`);
    console.log(`  ${label("Operator:")}  ${info.operator}`);
    console.log(`  ${label("Source:")}    ${source}`);
    console.log("");

    // Stake
    console.log(chalk.bold("Stake"));
    console.log(`  ${label("Self (vStake):")}      ${info.vStake} ${chalk.gray("(counts toward eligibility)")}`);
    console.log(`  ${label("Delegated (dStake):")} ${info.dStake} ${chalk.gray("(does NOT count toward eligibility)")}`);
    console.log(`  ${label("Deposit (vDeposit):")}    ${info.vDeposit}`);
    console.log(`  ${label("Withdrawal (vWithdrawal):")} ${info.vWithdrawal}`);
    console.log("");

    // Status. `live` printed as the raw boolean, an opaque contract flag.
    console.log(chalk.bold("Status"));
    console.log(`  ${label("live:")}          ${info.live} ${chalk.gray("(contract flag: primed & not exited — not an eligibility signal)")}`);
    console.log(`  ${label("needsPriming:")}  ${info.needsPriming}`);
    console.log(`  ${label("Banned:")}        ${result.banned}`);
    console.log(`  ${label("Primed epoch (ePrimed):")} ${info.ePrimed}`);
    console.log(`  ${label("Current epoch:")} ${currentEpoch}`);
    console.log("");

    // Pending self-stake deposits
    console.log(chalk.bold("Pending self-stake deposits"));
    const deposits = result.selfStakePendingDeposits;
    if (Array.isArray(deposits) && deposits.length > 0) {
      for (const d of deposits) {
        console.log(
          `  ${label("epoch")} ${d.epoch}: ${d.stake} ` +
            `${chalk.gray(`(activatesAtEpoch ${d.activatesAtEpoch}, ${d.epochsRemaining ?? d.status} epochs remaining)`)}`,
        );
      }
    } else {
      console.log(`  ${typeof deposits === "string" ? deposits : "None"}`);
    }
    console.log("");

    // Pending self-stake withdrawals
    console.log(chalk.bold("Pending self-stake withdrawals"));
    const withdrawals = result.selfStakePendingWithdrawals;
    if (Array.isArray(withdrawals) && withdrawals.length > 0) {
      for (const w of withdrawals) {
        console.log(
          `  ${label("epoch")} ${w.epoch}: ${w.stake} ` +
            `${chalk.gray(`(claimableAtEpoch ${w.claimableAtEpoch}, ${w.status})`)}`,
        );
      }
    } else {
      console.log(`  ${typeof withdrawals === "string" ? withdrawals : "None"}`);
    }
    console.log("");

    // Eligibility warning (display-only — never blocks a read command).
    this.renderEligibility(info, epochInfo);
  }

  /**
   * Display-only self-stake eligibility note (decision 2). Counts still-pending
   * self-stake deposits toward the effective self-stake:
   *   effectiveSelfStakeRaw = vStakeRaw + sum(pendingDeposits[].stakeRaw)
   * Epoch-0 aware. Reads the minimum from epochInfo — never hardcoded.
   */
  private renderEligibility(
    info: ValidatorInfo,
    epochInfo: {currentEpoch: bigint; validatorMinStake: string; validatorMinStakeRaw: bigint},
  ): void {
    const minRaw = epochInfo.validatorMinStakeRaw;
    const minFmt = epochInfo.validatorMinStake;
    const pendingSum = info.pendingDeposits.reduce((sum, d) => sum + d.stakeRaw, 0n);
    const effectiveSelfStakeRaw = info.vStakeRaw + pendingSum;

    if (epochInfo.currentEpoch === 0n) {
      this.logInfo(
        `Epoch 0: minimum self-stake not enforced yet. This validator won't become active until its ` +
          `self-stake reaches ${minFmt}.`,
      );
      return;
    }

    if (effectiveSelfStakeRaw < minRaw) {
      this.logWarning(
        `Self-stake below minimum: ${info.vStake} self-staked vs ${minFmt} required. This validator ` +
          `won't become active until its self-stake reaches the minimum. Only self-stake counts toward ` +
          `eligibility (delegated stake does not).`,
      );
      return;
    }

    if (info.vStakeRaw < minRaw) {
      // Active stake alone is below min, but pending deposits will cross it.
      let running = info.vStakeRaw;
      let activatesAtEpoch = "?";
      const sorted = [...info.pendingDeposits].sort((a, b) => (a.epoch < b.epoch ? -1 : a.epoch > b.epoch ? 1 : 0));
      for (const d of sorted) {
        running += d.stakeRaw;
        if (running >= minRaw) {
          activatesAtEpoch = (d.epoch + ACTIVATION_DELAY_EPOCHS).toString();
          break;
        }
      }
      this.logInfo(
        `Self-stake meets the ${minFmt} minimum once the pending deposit activates at epoch ` +
          `${activatesAtEpoch}. Currently ${info.vStake} is active.`,
      );
    }
  }

  async getStakeInfo(options: StakingInfoOptions & {delegator?: string}): Promise<void> {
    this.startSpinner("Fetching stake info...");

    try {
      const client = await this.getReadOnlyStakingClient(options);
      const delegatorAddress = await this.resolveActiveIdentity(options, options.delegator);
      const isOwnDelegation = !options.delegator;

      this.setSpinnerText(`Fetching delegation info for ${delegatorAddress}...`);

      if (!options.validator) {
        this.failSpinner("Validator address is required");
        return;
      }

      const [info, epochInfo] = await Promise.all([
        client.getStakeInfo(delegatorAddress as Address, options.validator as Address),
        client.getEpochInfo(),
      ]);

      const currentEpoch = epochInfo.currentEpoch;

      // Calculate projected rewards
      let projectedReward = "N/A";
      if (epochInfo.totalWeight > 0n && epochInfo.inflationRaw > 0n && info.stakeRaw > 0n) {
        const rewardRaw = (info.stakeRaw * epochInfo.inflationRaw) / epochInfo.totalWeight;
        projectedReward = client.formatStakingAmount(rewardRaw) + " per epoch";
      } else if (epochInfo.inflationRaw === 0n) {
        projectedReward = "0 GEN (no inflation this epoch)";
      }

      const result = {
        delegator: info.delegator,
        validator: info.validator,
        shares: info.shares.toString(),
        stake: info.stake,
        projectedReward,
        pendingDeposits: (() => {
          // Filter to only truly pending deposits (not yet active)
          const pending = info.pendingDeposits.filter(d => d.epoch + ACTIVATION_DELAY_EPOCHS > currentEpoch);
          return pending.length > 0
            ? pending.map(d => {
                const depositEpoch = d.epoch;
                const activationEpoch = depositEpoch + ACTIVATION_DELAY_EPOCHS;
                const epochsUntilActive = activationEpoch - currentEpoch;
                return {
                  epoch: depositEpoch.toString(),
                  stake: d.stake,
                  shares: d.shares.toString(),
                  activatesAtEpoch: activationEpoch.toString(),
                  epochsRemaining: epochsUntilActive.toString(),
                };
              })
            : "None";
        })(),
        pendingWithdrawals:
          info.pendingWithdrawals.length > 0
            ? info.pendingWithdrawals.map(w => {
                const exitEpoch = w.epoch;
                const claimableEpoch = exitEpoch + UNBONDING_PERIOD_EPOCHS; // Must wait 7 full epochs
                const epochsUntilClaimable = claimableEpoch - currentEpoch;
                return {
                  epoch: exitEpoch.toString(),
                  shares: w.shares.toString(),
                  stake: w.stake,
                  claimableAtEpoch: claimableEpoch.toString(),
                  status:
                    epochsUntilClaimable <= 0n
                      ? "Claimable now"
                      : `Unbonding (${epochsUntilClaimable} epoch${epochsUntilClaimable > 1n ? "s" : ""} remaining)`,
                };
              })
            : "None",
      };

      const msg = isOwnDelegation ? "Your delegation info" : `Delegation info for ${delegatorAddress}`;
      this.succeedSpinner(msg, result);
    } catch (error: any) {
      this.failSpinner("Failed to get stake info", error.message || error);
    }
  }

  async getEpochInfo(options: StakingConfig & {epoch?: string}): Promise<void> {
    this.startSpinner("Fetching epoch info...");

    try {
      const client = await this.getReadOnlyStakingClient(options);
      const info = await client.getEpochInfo();

      const formatDuration = (ms: number): string => {
        const hours = Math.floor(ms / (1000 * 60 * 60));
        const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
        if (hours > 24) {
          const days = Math.floor(hours / 24);
          const remainingHours = hours % 24;
          return `${days}d ${remainingHours}h ${minutes}m`;
        }
        return `${hours}h ${minutes}m`;
      };

      const formatAmount = client.formatStakingAmount;

      // If specific epoch requested, show just that epoch's data
      if (options.epoch !== undefined) {
        const epochNum = BigInt(options.epoch);
        const epochData = await client.getEpochData(epochNum);
        const isFinalized = info.lastFinalizedEpoch >= epochNum;
        const startDate = new Date(Number(epochData.start) * 1000);
        const endDate = epochData.end > 0n ? new Date(Number(epochData.end) * 1000) : null;

        this.succeedSpinner(`Epoch ${epochNum}`);
        console.log(`\n  Epoch:      ${epochNum}`);
        console.log(`  Started:    ${startDate.toISOString()}`);
        console.log(`  Ended:      ${endDate?.toISOString() || "Not yet"}`);
        console.log(`  Finalized:  ${isFinalized ? "Yes" : "No"}`);
        console.log(`  Validators: ${epochData.vcount}`);
        console.log(`  Weight:     ${epochData.weight}`);
        console.log(`  Inflation:  ${formatAmount(epochData.inflation)}`);
        console.log(`  Claimed:    ${formatAmount(epochData.claimed)}`);
        console.log(`  Slashed:    ${formatAmount(epochData.slashed)}`);
        console.log();
        return;
      }

      // Default: show current + previous epoch
      const currentEpochData = await client.getEpochData(info.currentEpoch);
      const currentStart = new Date(Number(currentEpochData.start) * 1000);
      const now = Date.now();
      const timeSinceStart = now - currentStart.getTime();
      const timeUntilNext = info.nextEpochEstimate ? info.nextEpochEstimate.getTime() - now : null;

      this.succeedSpinner("Epoch info");

      const nextEstimate = timeUntilNext && timeUntilNext > 0
        ? `in ${formatDuration(timeUntilNext)}`
        : currentEpochData.end > 0n ? "Next epoch started" : "N/A";

      console.log(`\n  Current Epoch: ${info.currentEpoch} (started ${formatDuration(timeSinceStart)} ago)`);
      console.log(`  Next Epoch:    ${nextEstimate}`);
      console.log(`  Validators:    ${info.activeValidatorsCount}`);
      console.log(`  Weight:        ${currentEpochData.weight}`);
      console.log(`  Slashed:       ${formatAmount(currentEpochData.slashed)}`);

      // Previous epoch (has the actual inflation/rewards data)
      if (info.currentEpoch > 0n) {
        const prevEpoch = info.currentEpoch - 1n;
        const prevData = await client.getEpochData(prevEpoch);
        const isFinalized = info.lastFinalizedEpoch >= prevEpoch;
        const prevEnd = prevData.end > 0n;

        let status: string;
        if (!prevEnd) {
          status = "still active";
        } else if (isFinalized) {
          status = "finalized";
        } else {
          status = "finalizing txs...";
        }

        console.log(`\n  Previous Epoch: ${prevEpoch} (${status})`);
        console.log(`  Inflation:      ${formatAmount(prevData.inflation)}`);
        console.log(`  Claimed:        ${formatAmount(prevData.claimed)}`);
        console.log(`  Unclaimed:      ${formatAmount(prevData.inflation - prevData.claimed)}`);
        console.log(`  Slashed:        ${formatAmount(prevData.slashed)}`);
      }

      console.log(`\n  Min Epoch Duration:   ${formatDuration(Number(info.epochMinDuration) * 1000)}`);
      console.log(`  Validator Min Stake:  ${info.validatorMinStake}`);
      console.log(`  Delegator Min Stake:  ${info.delegatorMinStake}\n`);
    } catch (error: any) {
      this.failSpinner("Failed to get epoch info", error.message || error);
    }
  }

  async listActiveValidators(options: StakingConfig): Promise<void> {
    this.startSpinner("Fetching active validators...");

    try {
      const client = await this.getReadOnlyStakingClient(options);

      const activeValidators = await client.getActiveValidators();

      const result = {
        count: activeValidators.length,
        validators: activeValidators,
      };

      this.succeedSpinner("Active validators retrieved", result);
    } catch (error: any) {
      this.failSpinner("Failed to get active validators", error.message || error);
    }
  }

  async listQuarantinedValidators(options: StakingConfig): Promise<void> {
    this.startSpinner("Fetching quarantined validators...");

    try {
      const client = await this.getReadOnlyStakingClient(options);

      const validators = await client.getQuarantinedValidatorsDetailed();

      const result = {
        count: validators.length,
        validators: validators.map(v => ({
          validator: v.validator,
          untilEpoch: v.untilEpoch.toString(),
          permanentlyBanned: v.permanentlyBanned,
        })),
      };

      this.succeedSpinner("Quarantined validators retrieved", result);
    } catch (error: any) {
      this.failSpinner("Failed to get quarantined validators", error.message || error);
    }
  }

  async listBannedValidators(options: StakingConfig): Promise<void> {
    this.startSpinner("Fetching banned validators...");

    try {
      const client = await this.getReadOnlyStakingClient(options);

      const validators = await client.getBannedValidators();

      const result = {
        count: validators.length,
        validators: validators.map(v => ({
          validator: v.validator,
          untilEpoch: v.permanentlyBanned ? "permanent" : v.untilEpoch.toString(),
          permanentlyBanned: v.permanentlyBanned,
        })),
      };

      this.succeedSpinner("Banned validators retrieved", result);
    } catch (error: any) {
      this.failSpinner("Failed to get banned validators", error.message || error);
    }
  }

  async listValidators(options: StakingConfig & {all?: boolean}): Promise<void> {
    this.startSpinner("Fetching validator set...");

    try {
      const client = await this.getReadOnlyStakingClient(options);

      // Get current user's address to mark "mine" — honor a live wallet session
      // so "mine" tracks the connected identity, not just the keystore default.
      let myAddress: Address | null = null;
      try {
        myAddress = await this.resolveActiveIdentity(options);
      } catch {
        // No account or session configured, that's fine
      }

      // Use tree traversal to get ALL validators (including not-yet-primed)
      const allTreeAddresses = await this.getAllValidatorsFromTree(options);

      // Also fetch status lists in parallel
      const [activeAddresses, quarantinedList, bannedList, epochInfo] = await Promise.all([
        client.getActiveValidators(),
        client.getQuarantinedValidatorsDetailed(),
        options.all ? client.getBannedValidators() : Promise.resolve([]),
        client.getEpochInfo(),
      ]);

      // Build set of quarantined/banned for status lookup
      const quarantinedSet = new Map(quarantinedList.map(v => [v.validator.toLowerCase(), v]));
      const bannedSet = new Map(bannedList.map(v => [v.validator.toLowerCase(), v]));
      const activeSet = new Set(activeAddresses.map(a => a.toLowerCase()));

      // Filter out banned if not --all
      const allAddresses = options.all
        ? allTreeAddresses
        : allTreeAddresses.filter(addr => !bannedSet.has(addr.toLowerCase()));

      this.setSpinnerText(`Fetching details for ${allAddresses.length} validators...`);

      // Fetch detailed info in batches to avoid rate limiting
      const BATCH_SIZE = 5;
      const addressArray = Array.from(allAddresses);
      const validatorInfos: ValidatorInfo[] = [];

      for (let i = 0; i < addressArray.length; i += BATCH_SIZE) {
        const batch = addressArray.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(addr => client.getValidatorInfo(addr as Address))
        );
        validatorInfos.push(...batchResults);
        if (i + BATCH_SIZE < addressArray.length) {
          this.setSpinnerText(`Fetching details... ${Math.min(i + BATCH_SIZE, addressArray.length)}/${addressArray.length}`);
        }
      }

      // Build table rows
      type ValidatorRow = {
        info: ValidatorInfo;
        status: string;
        isMine: boolean;
        totalStakeRaw: bigint;
      };

      const rows: ValidatorRow[] = validatorInfos.map(info => {
        const addrLower = info.address.toLowerCase();
        const isQuarantined = quarantinedSet.has(addrLower);
        const isBanned = bannedSet.has(addrLower);
        const isActive = activeSet.has(addrLower);

        let status = "";
        if (isBanned) {
          const banInfo = bannedSet.get(addrLower)!;
          status = banInfo.permanentlyBanned ? "BANNED" : `banned(e${banInfo.untilEpoch})`;
        } else if (isQuarantined) {
          const qInfo = quarantinedSet.get(addrLower)!;
          status = `quarant(e${qInfo.untilEpoch})`;
        } else if (isActive) {
          status = "active";
        } else {
          status = "pending";
        }

        const isMine = myAddress
          ? info.owner.toLowerCase() === myAddress.toLowerCase() ||
            info.operator.toLowerCase() === myAddress.toLowerCase()
          : false;

        return {
          info,
          status,
          isMine,
          totalStakeRaw: info.vStakeRaw + info.dStakeRaw,
        };
      });

      // Calculate validator weight using the contract formula:
      // weight = (vStake * alpha + dStake * (1 - alpha)) ^ beta
      // Default: alpha = 0.6, beta = 0.5 (square root)
      const ALPHA = 0.6;
      const BETA = 0.5;
      const calcWeight = (vStakeRaw: bigint, dStakeRaw: bigint): number => {
        const vStake = Number(vStakeRaw) / 1e18;
        const dStake = Number(dStakeRaw) / 1e18;
        const util = vStake * ALPHA + dStake * (1 - ALPHA);
        return Math.pow(util, BETA);
      };

      // Add weight to rows and sort by weight descending
      const rowsWithWeight = rows.map(r => ({
        ...r,
        weight: calcWeight(r.info.vStakeRaw, r.info.dStakeRaw),
      }));
      rowsWithWeight.sort((a, b) => b.weight - a.weight);

      // Calculate total weight for active validators only (for power %)
      const totalWeight = rowsWithWeight
        .filter(r => r.status === "active")
        .reduce((sum, r) => sum + r.weight, 0);

      this.stopSpinner();

      // Format stake - shorten large numbers
      const formatStake = (s: string) => {
        const num = parseFloat(s.replace(" GEN", ""));
        if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
        if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
        if (num >= 1) return num.toFixed(1);
        if (num > 0) return num.toPrecision(2);
        return "0";
      };

      // Create table (no fixed widths - let it auto-size)
      const table = new Table({
        head: [
          chalk.cyan("#"),
          chalk.cyan("Validator"),
          chalk.cyan("Self"),
          chalk.cyan("Deleg"),
          chalk.cyan("Pending"),
          chalk.cyan("Primed"),
          chalk.cyan("Weight"),
          chalk.cyan("Status"),
        ],
        style: {head: [], border: []},
      });

      rowsWithWeight.forEach((row, idx) => {
        const {info, status, isMine, weight} = row;

        // Weight percentage (share of active set weight)
        const weightPct = totalWeight > 0 ? (weight / totalWeight) * 100 : 0;
        const weightStr = status === "active" ? `${weightPct.toFixed(1)}%` : chalk.gray("-");

        // Pending deposits/withdrawals - sum amounts (filter to truly pending only)
        const currentEpoch = epochInfo.currentEpoch;
        const trulyPendingDeposits = info.pendingDeposits.filter(d => d.epoch + ACTIVATION_DELAY_EPOCHS > currentEpoch);
        const trulyPendingWithdrawals = info.pendingWithdrawals.filter(w => w.epoch + UNBONDING_PERIOD_EPOCHS > currentEpoch);
        const pendingDepositSum = trulyPendingDeposits.reduce((sum, d) => sum + d.stakeRaw, 0n);
        const pendingWithdrawSum = trulyPendingWithdrawals.reduce((sum, w) => sum + w.stakeRaw, 0n);
        let pendingStr = "-";
        if (pendingDepositSum > 0n && pendingWithdrawSum > 0n) {
          pendingStr = chalk.green(`+${formatStake(`${Number(pendingDepositSum) / 1e18} GEN`)}`) +
            " " + chalk.red(`-${formatStake(`${Number(pendingWithdrawSum) / 1e18} GEN`)}`);
        } else if (pendingDepositSum > 0n) {
          pendingStr = chalk.green(`+${formatStake(`${Number(pendingDepositSum) / 1e18} GEN`)}`);
        } else if (pendingWithdrawSum > 0n) {
          pendingStr = chalk.red(`-${formatStake(`${Number(pendingWithdrawSum) / 1e18} GEN`)}`)
        }

        // Role indicator (colored)
        let roleTag = "";
        if (isMine) {
          if (myAddress && info.owner.toLowerCase() === myAddress.toLowerCase()) {
            roleTag = info.operator.toLowerCase() === myAddress.toLowerCase()
              ? chalk.cyan(" [own+op]")
              : chalk.cyan(" [owner]");
          } else {
            roleTag = chalk.cyan(" [operator]");
          }
        }

        // Moniker + role + full address on second line
        let moniker = info.identity?.moniker || "";
        if (moniker.length > 20) moniker = moniker.slice(0, 19) + "…";
        const validatorCell = moniker
          ? `${moniker}${roleTag}\n${chalk.gray(info.address)}`
          : `${chalk.gray(info.address)}${roleTag}`;

        // Primed status - color based on how current it is
        let primedStr: string;
        if (info.ePrimed >= currentEpoch) {
          primedStr = chalk.green(`e${info.ePrimed}`);
        } else if (info.ePrimed === currentEpoch - 1n) {
          primedStr = chalk.yellow(`e${info.ePrimed}`);
        } else {
          primedStr = chalk.red(`e${info.ePrimed}!`);
        }

        // Status coloring
        let statusStr = status;
        if (status === "active") statusStr = chalk.green(status);
        else if (status === "BANNED") statusStr = chalk.red(status);
        else if (status.startsWith("quarant")) statusStr = chalk.yellow(status);
        else if (status.startsWith("banned")) statusStr = chalk.red(status);
        else if (status === "pending") statusStr = chalk.gray(status);

        table.push([
          (idx + 1).toString(),
          validatorCell,
          formatStake(info.vStake),
          formatStake(info.dStake),
          pendingStr,
          primedStr,
          weightStr,
          statusStr,
        ]);
      });

      console.log("");
      console.log(table.toString());
      console.log("");
      const activeCount = rowsWithWeight.filter(r => r.status === "active").length;
      console.log(chalk.gray(`Total: ${rowsWithWeight.length} validators (${activeCount} active)`));
      console.log("");
    } catch (error: any) {
      this.failSpinner("Failed to list validators", error.message || error);
    }
  }
}
