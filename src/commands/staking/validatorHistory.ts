import {StakingAction, StakingConfig, BUILT_IN_NETWORKS} from "./StakingAction";
import type {Address, GenLayerChain} from "genlayer-js/types";
import {createPublicClient, http} from "viem";
import Table from "cli-table3";
import chalk from "chalk";

// Event ABIs for log fetching
// v0.5: SlashedFromIdleness adds txStatus (uint8 enum) parameter
const SLASH_EVENT_ABI = {
  type: "event",
  name: "SlashedFromIdleness",
  inputs: [
    {name: "validator", type: "address", indexed: true},
    {name: "txId", type: "bytes32", indexed: false},
    {name: "epoch", type: "uint256", indexed: false},
    {name: "percentage", type: "uint256", indexed: false},
    {name: "txStatus", type: "uint8", indexed: false},
  ],
} as const;

const REWARD_EVENT_ABI = {
  type: "event",
  name: "ValidatorPrime",
  inputs: [
    {name: "validator", type: "address", indexed: false},
    {name: "epoch", type: "uint256", indexed: false},
    {name: "validatorRewards", type: "uint256", indexed: false},
    {name: "delegatorRewards", type: "uint256", indexed: false},
  ],
} as const;

export interface ValidatorHistoryOptions extends StakingConfig {
  validator?: string;
  fromBlock?: string;
  fromEpoch?: string;
  epochs?: string;
  limit?: string;
  all?: boolean;
}

interface SlashEvent {
  type: "slash";
  epoch: bigint;
  txId: string;
  percentage: bigint;
  blockNumber: bigint;
  timestamp: Date;
}

interface RewardEvent {
  type: "reward";
  epoch: bigint;
  validatorRewards: bigint;
  delegatorRewards: bigint;
  blockNumber: bigint;
  timestamp: Date;
}

type HistoryEvent = SlashEvent | RewardEvent;

export class ValidatorHistoryAction extends StakingAction {
  constructor() {
    super();
  }

  private getNetworkForHistory(config: StakingConfig): GenLayerChain {
    if (config.network) {
      const network = BUILT_IN_NETWORKS[config.network];
      if (!network) {
        throw new Error(`Unknown network: ${config.network}`);
      }
      return network;
    }
    // Check global config
    const globalNetwork = this.getConfig().network;
    if (globalNetwork && BUILT_IN_NETWORKS[globalNetwork]) {
      return BUILT_IN_NETWORKS[globalNetwork];
    }
    return BUILT_IN_NETWORKS["localnet"];
  }

  async execute(options: ValidatorHistoryOptions): Promise<void> {
    this.startSpinner("Fetching validator history...");

    try {
      // Check network - localnet doesn't support eth_getLogs
      const chain = this.getNetworkForHistory(options);
      if (chain.id === 808080) {
        this.failSpinner("validator-history requires testnet-asimov (localnet doesn't support event logs)");
        return;
      }

      const client = await this.getReadOnlyStakingClient(options);
      const validatorAddress = options.validator || (await this.getSignerAddress());

      // Verify it's a validator
      const isValidator = await client.isValidator(validatorAddress as Address);
      if (!isValidator) {
        this.failSpinner(`Address ${validatorAddress} is not a validator`);
        return;
      }

      this.setSpinnerText("Fetching contract addresses...");

      // Get addresses
      const stakingAddress = client.getStakingContract().address;
      const slashingAddress = await client.getSlashingAddress();

      // Create public client for log fetching
      const publicClient = createPublicClient({
        chain,
        transport: http(chain.rpcUrls.default.http[0]),
      });

      // Determine epoch range for filtering
      const epochInfo = await client.getEpochInfo();
      const currentEpoch = epochInfo.currentEpoch;
      const defaultEpochs = 10n;

      let minEpoch: bigint | null = null;
      let fromBlock: bigint | "earliest" = "earliest";

      if (options.fromBlock) {
        // Explicit block takes precedence
        fromBlock = BigInt(options.fromBlock);
      } else if (options.fromEpoch) {
        // Filter by starting epoch
        minEpoch = BigInt(options.fromEpoch);
      } else if (options.all) {
        // Fetch all history (warn user)
        console.log(chalk.yellow("Warning: Fetching all history from genesis. This may be slow for long-lived validators."));
        console.log(chalk.yellow("Consider using --epochs <n> or --from-epoch <n> for faster queries.\n"));
      } else {
        // Default: last N epochs
        const numEpochs = options.epochs ? BigInt(options.epochs) : defaultEpochs;
        minEpoch = currentEpoch > numEpochs ? currentEpoch - numEpochs : 0n;
      }

      const limit = options.limit ? parseInt(options.limit) : 50;

      this.setSpinnerText("Fetching slash events...");

      // Fetch slash events (indexed by validator)
      const slashLogs = await publicClient.getLogs({
        address: slashingAddress as `0x${string}`,
        event: SLASH_EVENT_ABI,
        args: {validator: validatorAddress as `0x${string}`},
        fromBlock,
        toBlock: "latest",
      });

      this.setSpinnerText("Fetching reward events...");

      // Fetch reward events (not indexed, need to filter client-side)
      const rewardLogs = await publicClient.getLogs({
        address: stakingAddress,
        event: REWARD_EVENT_ABI,
        fromBlock,
        toBlock: "latest",
      });

      // Filter rewards to this validator
      const filteredRewardLogs = rewardLogs.filter(
        log => (log.args as any).validator?.toLowerCase() === validatorAddress.toLowerCase()
      );

      // Get unique block numbers to fetch timestamps
      const allLogs = [...slashLogs, ...filteredRewardLogs];
      const uniqueBlocks = [...new Set(allLogs.map(l => l.blockNumber))];

      this.setSpinnerText("Fetching block timestamps...");

      // Fetch block timestamps in batches
      const blockTimestamps = new Map<bigint, Date>();
      const BATCH_SIZE = 10;
      for (let i = 0; i < uniqueBlocks.length; i += BATCH_SIZE) {
        const batch = uniqueBlocks.slice(i, i + BATCH_SIZE);
        const blocks = await Promise.all(
          batch.map(blockNumber => publicClient.getBlock({blockNumber}))
        );
        blocks.forEach(block => {
          blockTimestamps.set(block.number, new Date(Number(block.timestamp) * 1000));
        });
      }

      // Transform to typed events
      let slashEvents: SlashEvent[] = slashLogs.map(log => ({
        type: "slash" as const,
        epoch: (log.args as any).epoch as bigint,
        txId: (log.args as any).txId as string,
        percentage: (log.args as any).percentage as bigint,
        blockNumber: log.blockNumber,
        timestamp: blockTimestamps.get(log.blockNumber) || new Date(0),
      }));

      let rewardEvents: RewardEvent[] = filteredRewardLogs.map(log => ({
        type: "reward" as const,
        epoch: (log.args as any).epoch as bigint,
        validatorRewards: (log.args as any).validatorRewards as bigint,
        delegatorRewards: (log.args as any).delegatorRewards as bigint,
        blockNumber: log.blockNumber,
        timestamp: blockTimestamps.get(log.blockNumber) || new Date(0),
      }));

      // Filter by epoch if specified
      if (minEpoch !== null) {
        slashEvents = slashEvents.filter(e => e.epoch >= minEpoch!);
        rewardEvents = rewardEvents.filter(e => e.epoch >= minEpoch!);
      }

      // Combine and sort by block number descending
      const allEvents: HistoryEvent[] = [...slashEvents, ...rewardEvents];
      allEvents.sort((a, b) => Number(b.blockNumber - a.blockNumber));

      // Apply limit
      const limitedEvents = allEvents.slice(0, limit);

      // Calculate totals
      const totalValidatorRewards = rewardEvents.reduce((sum, e) => sum + e.validatorRewards, 0n);
      const totalDelegatorRewards = rewardEvents.reduce((sum, e) => sum + e.delegatorRewards, 0n);

      this.stopSpinner();

      // Display results
      if (limitedEvents.length === 0) {
        console.log(chalk.yellow("\nNo history events found for this validator.\n"));
        return;
      }

      // Format timestamp as datetime
      const formatTime = (date: Date): string => {
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        const hours = String(date.getHours()).padStart(2, "0");
        const minutes = String(date.getMinutes()).padStart(2, "0");
        return `${month}-${day} ${hours}:${minutes}`;
      };

      // Create table
      const table = new Table({
        head: [
          chalk.cyan("Time"),
          chalk.cyan("Epoch"),
          chalk.cyan("Type"),
          chalk.cyan("Details"),
          chalk.cyan("GL TxId / Block"),
        ],
        style: {head: [], border: []},
      });

      for (const event of limitedEvents) {
        if (event.type === "slash") {
          const pct = Number(event.percentage) / 100; // basis points to %
          table.push([
            formatTime(event.timestamp),
            event.epoch.toString(),
            chalk.red("SLASH"),
            `${pct.toFixed(2)}%`,
            event.txId,
          ]);
        } else {
          const valReward = client.formatStakingAmount(event.validatorRewards);
          const delReward = client.formatStakingAmount(event.delegatorRewards);
          table.push([
            formatTime(event.timestamp),
            event.epoch.toString(),
            chalk.green("REWARD"),
            `Val: ${valReward}, Del: ${delReward}`,
            `block ${event.blockNumber}`,
          ]);
        }
      }

      console.log("");
      console.log(chalk.bold(`History for ${validatorAddress}`));
      console.log(table.toString());
      console.log("");

      // Summary
      const epochRangeInfo = minEpoch !== null
        ? `epochs ${minEpoch}-${currentEpoch}`
        : options.fromBlock
          ? `from block ${options.fromBlock}`
          : "all epochs";
      console.log(chalk.gray("Summary:"));
      console.log(chalk.gray(`  Range: ${epochRangeInfo}`));
      console.log(chalk.gray(`  Slash events: ${slashEvents.length}`));
      console.log(chalk.gray(`  Reward events: ${rewardEvents.length}`));
      console.log(chalk.gray(`  Total validator rewards: ${client.formatStakingAmount(totalValidatorRewards)}`));
      console.log(chalk.gray(`  Total delegator rewards: ${client.formatStakingAmount(totalDelegatorRewards)}`));
      if (allEvents.length > limit) {
        console.log(chalk.gray(`  (showing ${limit} of ${allEvents.length} events)`));
      }
      console.log(chalk.gray(`  Use --all to fetch complete history, --epochs <n> for last N epochs`));
      console.log("");
    } catch (error: any) {
      this.failSpinner("Failed to get validator history", error.message || error);
    }
  }
}
