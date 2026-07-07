import {VestingAction, VestingConfig} from "./VestingAction";
import type {Address} from "genlayer-js/types";
import type {VestingState} from "./vestingTypes";
import Table from "cli-table3";
import chalk from "chalk";

export interface VestingListOptions extends VestingConfig {
  beneficiary?: string;
}

const CATEGORY_LABELS: Record<number, string> = {
  0: "Unspecified",
  1: "Team",
  2: "Advisor",
  3: "Investor",
  4: "Foundation",
  5: "Ecosystem",
  6: "Other",
};

function formatTimestamp(value: bigint): string {
  if (value === 0n) return "not set";
  return new Date(Number(value) * 1000).toISOString();
}

function formatDuration(seconds: bigint): string {
  if (seconds === 0n) return "0s";

  let remaining = Number(seconds);
  const days = Math.floor(remaining / 86400);
  remaining %= 86400;
  const hours = Math.floor(remaining / 3600);
  remaining %= 3600;
  const minutes = Math.floor(remaining / 60);
  const secs = remaining % 60;

  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (secs || parts.length === 0) parts.push(`${secs}s`);
  return parts.join(" ");
}

function formatBps(value: bigint): string {
  return `${(Number(value) / 100).toFixed(2).replace(/\.00$/, "")}%`;
}

function formatManualUnlock(state: VestingState): string {
  if (!state.needsManualUnlock) return "manual: no";
  return `manual: ${state.manualUnlocked ? "unlocked" : "required"}`;
}

function formatSchedule(state: VestingState): string {
  return [
    `start: ${formatTimestamp(state.startDate)}`,
    `cliff: ${formatDuration(state.cliffDuration)}`,
    `period: ${formatDuration(state.periodDuration)} x ${state.numberOfPeriods.toString()}`,
    `cliff unlock: ${formatBps(state.cliffUnlockBps)}`,
    formatManualUnlock(state),
  ].join("\n");
}

function formatRevocation(state: VestingState): string {
  if (state.revoked) {
    return [
      `revoked: yes`,
      `at: ${formatTimestamp(state.revokedAt)}`,
      `vested: ${state.vestedAtRevocation}`,
      `total: ${state.totalAmountAtRevocation}`,
    ].join("\n");
  }

  if (state.vestingStopped) {
    return [
      `revoked: no`,
      `stopped: yes`,
      `at: ${formatTimestamp(state.vestingStoppedAt)}`,
      `vested: ${state.vestedAtStop}`,
    ].join("\n");
  }

  return ["revoked: no", "stopped: no"].join("\n");
}

export class VestingListAction extends VestingAction {
  constructor() {
    super();
  }

  async execute(options: VestingListOptions): Promise<void> {
    this.startSpinner("Fetching vesting contracts...");

    try {
      const client = await this.getReadOnlyVestingClient(options);
      const beneficiary = (options.beneficiary as Address | undefined) || (await this.getSignerAddress());

      this.setSpinnerText(`Fetching vesting contracts for ${beneficiary}...`);

      const vestings = await client.getBeneficiaryVestings(beneficiary, this.getFactoryLookupOptions(options));

      if (vestings.length === 0) {
        this.succeedSpinner("No vesting contracts found", {beneficiary, count: 0});
        return;
      }

      this.setSpinnerText(`Fetching state for ${vestings.length} vesting contract${vestings.length === 1 ? "" : "s"}...`);
      const states = await Promise.all(
        vestings.map(async (vesting) => ({
          vesting,
          state: await client.getVestingState(vesting),
        })),
      );

      this.stopSpinner();

      const table = new Table({
        head: [
          chalk.cyan("Contract"),
          chalk.cyan("Name"),
          chalk.cyan("Category"),
          chalk.cyan("Total"),
          chalk.cyan("Vested"),
          chalk.cyan("Locked"),
          chalk.cyan("Withdrawable"),
          chalk.cyan("Schedule"),
          chalk.cyan("Revocation"),
        ],
        style: {head: [], border: []},
        wordWrap: true,
      });

      states.forEach(({vesting, state}) => {
        table.push([
          vesting,
          state.name || "-",
          CATEGORY_LABELS[state.category] || state.category.toString(),
          state.totalAmount,
          state.vestedAmount,
          state.unvestedAmount,
          state.withdrawableAmount,
          formatSchedule(state),
          formatRevocation(state),
        ]);
      });

      console.log("");
      console.log(table.toString());
      console.log("");
      console.log(chalk.gray(`Beneficiary: ${beneficiary}`));
      console.log(chalk.gray(`Total: ${states.length} vesting contract${states.length === 1 ? "" : "s"}`));
      console.log("");
    } catch (error: any) {
      this.failSpinner("Failed to list vesting contracts", error.message || error);
    }
  }
}
