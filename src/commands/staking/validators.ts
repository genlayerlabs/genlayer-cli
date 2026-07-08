import {resolveNetwork} from "../../lib/actions/BaseAction";
import {StakingAction, StakingConfig} from "./StakingAction";
import type {Address, GenLayerChain, ValidatorInfo} from "genlayer-js/types";
import Table from "cli-table3";
import chalk from "chalk";

const ACTIVATION_DELAY_EPOCHS = 2n;
const UNBONDING_PERIOD_EPOCHS = 7n;
const EXPLORER_PAGE_SIZE = 100;
const EXPLORER_TIMEOUT_MS = 5000;

export interface ValidatorsOptions extends StakingConfig {
  all?: boolean;
  json?: boolean;
  explorerUrl?: string;
  sortBy?: "stake" | "uptime" | string;
}

interface ExplorerValidatorSummary {
  validator_address?: string;
  validatorAddress?: string;
  status?: string | null;
  is_active?: boolean;
  isActive?: boolean;
  apy?: string | null;
  idle_pct_7d?: number | null;
  idlePct7d?: number | null;
  rotation_pct_7d?: number | null;
  rotationPct7d?: number | null;
  minority_pct_7d?: number | null;
  minorityPct7d?: number | null;
  transaction_count?: number;
  transactionCount?: number | null;
}

interface ExplorerAddressValidator {
  delegators?: unknown[];
  total_votes_7d?: number;
  totalVotes7d?: number | null;
  minority_votes_7d?: number;
  minorityVotes7d?: number | null;
  successful_appeals_7d?: number;
  successfulAppeals7d?: number | null;
  idle_pct_7d?: number | null;
  idlePct7d?: number | null;
  rotation_pct_7d?: number | null;
  rotationPct7d?: number | null;
  minority_pct_7d?: number | null;
  minorityPct7d?: number | null;
  apy?: string | null;
}

interface ExplorerPerformance {
  apy?: string | null;
  uptimePct?: number | null;
  idlePct7d?: number | null;
  rotationPct7d?: number | null;
  minorityPct7d?: number | null;
  totalVotes7d?: number | null;
  minorityVotes7d?: number | null;
  successfulAppeals7d?: number | null;
  transactionCount?: number | null;
}

interface ExplorerData {
  endpoint: string;
  validators: Map<string, ExplorerPerformance & {delegatorCount?: number}>;
}

interface ValidatorRow {
  address: Address;
  owner: Address;
  operator: Address;
  moniker?: string;
  active: boolean;
  live: boolean;
  banned: boolean;
  bannedUntilEpoch?: string;
  status: string;
  belowMin: boolean;
  selfStake: string;
  selfStakeRaw: bigint;
  delegatedStake: string;
  delegatedStakeRaw: bigint;
  totalStake: string;
  totalStakeRaw: bigint;
  pendingDepositRaw: bigint;
  pendingWithdrawalRaw: bigint;
  primedEpoch: string;
  needsPriming: boolean;
  delegatorCount: number | null;
  epochsActive: number | null;
  isMine: boolean;
  performance?: ExplorerPerformance;
}

export class ValidatorsAction extends StakingAction {
  async execute(options: ValidatorsOptions): Promise<void> {
    this.startSpinner("Fetching validator set...");

    try {
      const client: any = await this.getReadOnlyStakingClient(options);

      let myAddress: Address | null = null;
      try {
        myAddress = await this.getSignerAddress();
      } catch {
        // Listing validators should not require a local account.
      }

      const [allTreeAddresses, activeAddresses, quarantinedList, bannedList, epochInfo] = await Promise.all([
        this.getAllValidatorsFromTree(options),
        client.getActiveValidators(),
        client.getQuarantinedValidatorsDetailed(),
        client.getBannedValidators(),
        client.getEpochInfo(),
      ]);

      const quarantinedSet = new Map(quarantinedList.map((v: any) => [v.validator.toLowerCase(), v]));
      const bannedSet = new Map(bannedList.map((v: any) => [v.validator.toLowerCase(), v]));
      const activeSet = new Set(activeAddresses.map((a: string) => a.toLowerCase()));
      const currentEpoch = BigInt(epochInfo.currentEpoch);
      const validatorMinStakeRaw = BigInt(epochInfo.validatorMinStakeRaw ?? 0n);

      const allAddresses: Address[] = options.all
        ? allTreeAddresses
        : allTreeAddresses.filter((addr: Address) => !bannedSet.has(addr.toLowerCase()));

      this.setSpinnerText(`Fetching details for ${allAddresses.length} validators...`);

      const validatorInfos = await this.fetchValidatorInfos(client, allAddresses);
      const explorerUrl = options.explorerUrl || this.getDefaultExplorerUrl(options);
      const explorerData = explorerUrl
        ? await this.fetchExplorerData(explorerUrl, validatorInfos.map(info => info.address))
        : null;

      const rows = validatorInfos.map(info => {
        const addrLower = info.address.toLowerCase();
        const isQuarantined = quarantinedSet.has(addrLower);
        const isBanned = info.banned || bannedSet.has(addrLower);
        const isActive = activeSet.has(addrLower);
        const bannedInfo = bannedSet.get(addrLower);
        const quarantinedInfo = quarantinedSet.get(addrLower);
        const performance = explorerData?.validators.get(addrLower);

        return this.buildRow({
          info,
          currentEpoch,
          validatorMinStakeRaw,
          isActive,
          isQuarantined,
          isBanned,
          bannedInfo,
          quarantinedInfo,
          myAddress,
          performance,
        });
      });

      const sortedRows = this.sortRows(rows, options.sortBy || "stake");

      this.stopSpinner();

      if (options.json) {
        const output = {
          count: sortedRows.length,
          activeCount: sortedRows.filter(row => row.active).length,
          current_epoch: currentEpoch.toString(),
          sortBy: this.normalizeSortBy(options.sortBy || "stake"),
          explorer: explorerData
            ? {enabled: true, url: explorerUrl, endpoint: explorerData.endpoint}
            : {enabled: false, url: explorerUrl || null},
          validators: sortedRows.map(row => this.toJsonRow(row)),
        };
        console.log(JSON.stringify(output, null, 2));
        return;
      }

      this.printTable(sortedRows, currentEpoch);
    } catch (error: any) {
      this.failSpinner("Failed to list validators", error.message || error);
    }
  }

  private async fetchValidatorInfos(client: any, addresses: Address[]): Promise<ValidatorInfo[]> {
    const BATCH_SIZE = 5;
    const validatorInfos: ValidatorInfo[] = [];

    for (let i = 0; i < addresses.length; i += BATCH_SIZE) {
      const batch = addresses.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(addr => client.getValidatorInfo(addr as Address)),
      );
      validatorInfos.push(...batchResults);
      if (i + BATCH_SIZE < addresses.length) {
        this.setSpinnerText(`Fetching details... ${Math.min(i + BATCH_SIZE, addresses.length)}/${addresses.length}`);
      }
    }

    return validatorInfos;
  }

  private buildRow({
    info,
    currentEpoch,
    validatorMinStakeRaw,
    isActive,
    isQuarantined,
    isBanned,
    bannedInfo,
    quarantinedInfo,
    myAddress,
    performance,
  }: {
    info: ValidatorInfo;
    currentEpoch: bigint;
    validatorMinStakeRaw: bigint;
    isActive: boolean;
    isQuarantined: boolean;
    isBanned: boolean;
    bannedInfo: any;
    quarantinedInfo: any;
    myAddress: Address | null;
    performance?: ExplorerPerformance & {delegatorCount?: number};
  }): ValidatorRow {
    let status: string;
    let bannedUntilEpoch: string | undefined;
    const belowMin = info.vStakeRaw < validatorMinStakeRaw;
    const totalStakeRaw = info.vStakeRaw + info.dStakeRaw;

    if (isBanned) {
      if (bannedInfo?.permanentlyBanned) {
        status = "banned";
        bannedUntilEpoch = "permanent";
      } else {
        const epoch = bannedInfo?.untilEpoch ?? info.bannedEpoch;
        status = epoch !== undefined ? `banned(e${epoch})` : "banned";
        bannedUntilEpoch = epoch !== undefined ? epoch.toString() : undefined;
      }
    } else if (isQuarantined) {
      const untilEpoch = quarantinedInfo?.untilEpoch;
      status = untilEpoch !== undefined ? `quarantined(e${untilEpoch})` : "quarantined";
    } else if (belowMin && currentEpoch < ACTIVATION_DELAY_EPOCHS) {
      status = "pending-activation";
    } else if (belowMin && currentEpoch >= ACTIVATION_DELAY_EPOCHS) {
      status = "inactive/below-min";
    } else if (isActive) {
      status = "active";
    } else {
      status = info.live ? "pending" : "inactive";
    }

    const trulyPendingDeposits = info.pendingDeposits.filter(d => d.epoch + ACTIVATION_DELAY_EPOCHS > currentEpoch);
    const trulyPendingWithdrawals = info.pendingWithdrawals.filter(w => w.epoch + UNBONDING_PERIOD_EPOCHS > currentEpoch);

    const isMine = myAddress
      ? info.owner.toLowerCase() === myAddress.toLowerCase() ||
        info.operator.toLowerCase() === myAddress.toLowerCase()
      : false;

    return {
      address: info.address,
      owner: info.owner,
      operator: info.operator,
      moniker: info.identity?.moniker || undefined,
      active: isActive,
      live: info.live,
      banned: isBanned,
      bannedUntilEpoch,
      status,
      belowMin,
      selfStake: info.vStake,
      selfStakeRaw: info.vStakeRaw,
      delegatedStake: info.dStake,
      delegatedStakeRaw: info.dStakeRaw,
      totalStake: this.formatAmount(totalStakeRaw),
      totalStakeRaw,
      pendingDepositRaw: trulyPendingDeposits.reduce((sum, d) => sum + d.stakeRaw, 0n),
      pendingWithdrawalRaw: trulyPendingWithdrawals.reduce((sum, w) => sum + w.stakeRaw, 0n),
      primedEpoch: info.ePrimed.toString(),
      needsPriming: info.needsPriming,
      delegatorCount: performance?.delegatorCount ?? null,
      epochsActive: null,
      isMine,
      performance,
    };
  }

  private sortRows(rows: ValidatorRow[], sortBy: string): ValidatorRow[] {
    const normalized = this.normalizeSortBy(sortBy);
    const sorted = [...rows];

    if (normalized === "uptime") {
      sorted.sort((a, b) => {
        const au = a.performance?.uptimePct;
        const bu = b.performance?.uptimePct;
        if (au === undefined || au === null) return bu === undefined || bu === null ? this.compareStakeDescending(a, b) : 1;
        if (bu === undefined || bu === null) return -1;
        if (bu !== au) return bu - au;
        return this.compareStakeDescending(a, b);
      });
      return sorted;
    }

    sorted.sort((a, b) => this.compareStakeDescending(a, b));
    return sorted;
  }

  private compareStakeDescending(a: ValidatorRow, b: ValidatorRow): number {
    if (a.totalStakeRaw > b.totalStakeRaw) return -1;
    if (a.totalStakeRaw < b.totalStakeRaw) return 1;
    return a.address.localeCompare(b.address);
  }

  private normalizeSortBy(sortBy: string): "stake" | "uptime" {
    return sortBy === "uptime" ? "uptime" : "stake";
  }

  private resolveExplorerNetwork(config: StakingConfig): GenLayerChain {
    if (config.network) {
      return resolveNetwork(config.network, this.getCustomNetworks());
    }

    return resolveNetwork(this.getConfig().network, this.getCustomNetworks());
  }

  private getDefaultExplorerUrl(options: ValidatorsOptions): string | undefined {
    const network = this.resolveExplorerNetwork(options);
    if ((network as any).isStudio) {
      return undefined;
    }

    return network.blockExplorers?.default?.url;
  }

  private async fetchExplorerData(explorerUrl: string, addresses: Address[]): Promise<ExplorerData | null> {
    const validatorsResult = await this.fetchExplorerValidators(explorerUrl);
    if (!validatorsResult) {
      return null;
    }

    await this.enrichDelegatorCounts(validatorsResult, addresses);
    return validatorsResult;
  }

  private async fetchExplorerValidators(explorerUrl: string): Promise<ExplorerData | null> {
    for (const endpoint of this.getValidatorEndpointCandidates(explorerUrl)) {
      try {
        const validators = new Map<string, ExplorerPerformance>();
        let page = 1;
        let total = 0;

        do {
          const url = new URL(endpoint);
          url.searchParams.set("page", page.toString());
          url.searchParams.set("page_size", EXPLORER_PAGE_SIZE.toString());

          const response = await this.fetchJson(url.toString());
          if (!response || !Array.isArray(response.validators)) {
            throw new Error("Unexpected validators response");
          }

          total = typeof response.total === "number" ? response.total : response.validators.length;

          for (const item of response.validators as ExplorerValidatorSummary[]) {
            const address = item.validator_address || item.validatorAddress;
            if (!address) continue;
            validators.set(address.toLowerCase(), this.toExplorerPerformance(item));
          }

          page += 1;
        } while (validators.size < total && page <= 50);

        return {endpoint, validators};
      } catch {
        // Try the next plausible deployment path; explorer enrichment is optional.
      }
    }

    return null;
  }

  private async enrichDelegatorCounts(explorerData: ExplorerData, addresses: Address[]): Promise<void> {
    const apiBase = explorerData.endpoint.replace(/\/validators\/?$/, "");
    const BATCH_SIZE = 5;

    for (let i = 0; i < addresses.length; i += BATCH_SIZE) {
      const batch = addresses.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async address => {
        try {
          const response = await this.fetchJson(`${apiBase}/address/${address}`);
          const validator = response?.validator as ExplorerAddressValidator | undefined;
          if (!validator) return;

          const lower = address.toLowerCase();
          const existing = explorerData.validators.get(lower) || {};
          const detailPerformance = this.toExplorerPerformance(validator);
          const delegatorCount = Array.isArray(validator.delegators) ? validator.delegators.length : existing.delegatorCount;
          explorerData.validators.set(lower, this.mergeExplorerPerformance(existing, detailPerformance, delegatorCount));
        } catch {
          // Delegator counts are enrichment-only and should never break chain output.
        }
      }));
    }
  }

  private mergeExplorerPerformance(
    existing: ExplorerPerformance & {delegatorCount?: number},
    incoming: ExplorerPerformance,
    delegatorCount?: number,
  ): ExplorerPerformance & {delegatorCount?: number} {
    return {
      apy: incoming.apy ?? existing.apy,
      uptimePct: incoming.uptimePct ?? existing.uptimePct,
      idlePct7d: incoming.idlePct7d ?? existing.idlePct7d,
      rotationPct7d: incoming.rotationPct7d ?? existing.rotationPct7d,
      minorityPct7d: incoming.minorityPct7d ?? existing.minorityPct7d,
      totalVotes7d: incoming.totalVotes7d ?? existing.totalVotes7d,
      minorityVotes7d: incoming.minorityVotes7d ?? existing.minorityVotes7d,
      successfulAppeals7d: incoming.successfulAppeals7d ?? existing.successfulAppeals7d,
      transactionCount: incoming.transactionCount ?? existing.transactionCount,
      delegatorCount,
    };
  }

  private toExplorerPerformance(item: ExplorerValidatorSummary | ExplorerAddressValidator): ExplorerPerformance {
    const idlePct7d = this.pickNumber((item as any).idle_pct_7d, (item as any).idlePct7d);

    return {
      apy: (item as any).apy ?? undefined,
      uptimePct: idlePct7d === undefined || idlePct7d === null ? null : Math.max(0, 100 - idlePct7d),
      idlePct7d,
      rotationPct7d: this.pickNumber((item as any).rotation_pct_7d, (item as any).rotationPct7d),
      minorityPct7d: this.pickNumber((item as any).minority_pct_7d, (item as any).minorityPct7d),
      totalVotes7d: this.pickNumber((item as any).total_votes_7d, (item as any).totalVotes7d),
      minorityVotes7d: this.pickNumber((item as any).minority_votes_7d, (item as any).minorityVotes7d),
      successfulAppeals7d: this.pickNumber((item as any).successful_appeals_7d, (item as any).successfulAppeals7d),
      transactionCount: this.pickNumber((item as any).transaction_count, (item as any).transactionCount),
    };
  }

  private pickNumber(...values: unknown[]): number | null | undefined {
    for (const value of values) {
      if (typeof value === "number") return value;
      if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
        return Number(value);
      }
      if (value === null) return null;
    }
    return undefined;
  }

  private async fetchJson(url: string): Promise<any | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), EXPLORER_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        headers: {accept: "application/json"},
        signal: controller.signal,
      });

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  private getValidatorEndpointCandidates(explorerUrl: string): string[] {
    const base = this.normalizeUrl(explorerUrl);
    const url = new URL(base);
    const path = url.pathname.replace(/\/+$/, "");
    const originWithPath = `${url.origin}${path}`;
    const candidates = new Set<string>();

    if (path.endsWith("/api/v1")) {
      candidates.add(`${originWithPath}/validators`);
    } else if (path.endsWith("/api")) {
      candidates.add(`${originWithPath}/v1/validators`);
    } else {
      candidates.add(`${originWithPath}/api/v1/validators`);
      candidates.add(`${originWithPath}/explorer/api/v1/validators`);
      candidates.add(`${originWithPath}/validators`);
    }

    return [...candidates];
  }

  private normalizeUrl(url: string): string {
    if (/^https?:\/\//i.test(url)) {
      return url;
    }
    return `https://${url}`;
  }

  private toJsonRow(row: ValidatorRow) {
    return {
      address: row.address,
      owner: row.owner,
      operator: row.operator,
      moniker: row.moniker || null,
      active: row.active,
      live: row.live,
      banned: row.banned,
      bannedUntilEpoch: row.bannedUntilEpoch || null,
      status: row.status,
      below_min: row.belowMin,
      stake: {
        total: row.totalStake,
        totalRaw: row.totalStakeRaw.toString(),
        self: row.selfStake,
        selfRaw: row.selfStakeRaw.toString(),
        delegated: row.delegatedStake,
        delegatedRaw: row.delegatedStakeRaw.toString(),
      },
      delegatorCount: row.delegatorCount,
      epochsActive: row.epochsActive,
      primedEpoch: row.primedEpoch,
      needsPriming: row.needsPriming,
      pending: {
        depositRaw: row.pendingDepositRaw.toString(),
        withdrawalRaw: row.pendingWithdrawalRaw.toString(),
      },
      performance: row.performance
        ? {
            apy: row.performance.apy ?? null,
            uptimePct: row.performance.uptimePct ?? null,
            idlePct7d: row.performance.idlePct7d ?? null,
            rotationPct7d: row.performance.rotationPct7d ?? null,
            minorityPct7d: row.performance.minorityPct7d ?? null,
            totalVotes7d: row.performance.totalVotes7d ?? null,
            minorityVotes7d: row.performance.minorityVotes7d ?? null,
            successfulAppeals7d: row.performance.successfulAppeals7d ?? null,
            transactionCount: row.performance.transactionCount ?? null,
          }
        : null,
    };
  }

  private printTable(rows: ValidatorRow[], currentEpoch: bigint): void {
    const table = new Table({
      head: [
        chalk.cyan("#"),
        chalk.cyan("Validator"),
        chalk.cyan("Total Stake"),
        chalk.cyan("Self"),
        chalk.cyan("Deleg Stake"),
        chalk.cyan("Delegators"),
        chalk.cyan("Active"),
        chalk.cyan("Status"),
        chalk.cyan("Uptime"),
        chalk.cyan("Epochs"),
      ],
      style: {head: [], border: []},
    });

    rows.forEach((row, idx) => {
      table.push([
        (idx + 1).toString(),
        this.formatValidatorCell(row),
        this.formatCompactStake(row.totalStakeRaw),
        this.formatCompactStake(row.selfStakeRaw),
        this.formatCompactStake(row.delegatedStakeRaw),
        row.delegatorCount === null ? "-" : row.delegatorCount.toString(),
        row.active ? chalk.green("yes") : chalk.gray("no"),
        this.colorStatus(row.status),
        row.performance?.uptimePct === null || row.performance?.uptimePct === undefined
          ? "-"
          : `${row.performance.uptimePct.toFixed(1)}%`,
        row.epochsActive === null ? "-" : row.epochsActive.toString(),
      ]);
    });

    console.log("");
    console.log(chalk.gray(`Current epoch: ${currentEpoch}`));
    console.log(table.toString());
    console.log("");
    const activeCount = rows.filter(row => row.active).length;
    console.log(chalk.gray(`Total: ${rows.length} validators (${activeCount} active)`));
    console.log("");
  }

  private formatValidatorCell(row: ValidatorRow): string {
    let roleTag = "";
    if (row.isMine) {
      roleTag = chalk.cyan(" [mine]");
    }

    const moniker = row.moniker && row.moniker.length > 20
      ? row.moniker.slice(0, 19) + "..."
      : row.moniker;

    return moniker
      ? `${moniker}${roleTag}\n${chalk.gray(row.address)}`
      : `${chalk.gray(row.address)}${roleTag}`;
  }

  private colorStatus(status: string): string {
    if (status === "active") return chalk.green(status);
    if (status.startsWith("banned")) return chalk.red(status);
    if (status.startsWith("quarantined")) return chalk.yellow(status);
    if (status === "inactive/below-min") return chalk.yellow(status);
    if (status === "pending" || status === "pending-activation") return chalk.gray(status);
    return status;
  }

  private formatCompactStake(raw: bigint): string {
    const value = Number(raw) / 1e18;
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    if (value >= 1) return value.toFixed(1);
    if (value > 0) return value.toPrecision(2);
    return "0";
  }
}
