import {StakingAction, StakingConfig} from "./StakingAction";
import type {Address} from "genlayer-js/types";

// Epoch-related constants
const ACTIVATION_DELAY_EPOCHS = 2n;
const UNBONDING_PERIOD_EPOCHS = 7n;

export interface StakingInfoOptions extends StakingConfig {
  validator?: string;
}

export class StakingInfoAction extends StakingAction {
  constructor() {
    super();
  }

  async getValidatorInfo(options: StakingInfoOptions): Promise<void> {
    this.startSpinner("Fetching validator info...");

    try {
      const client = await this.getReadOnlyStakingClient(options);
      const validatorAddress = options.validator || (await this.getSignerAddress());

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
        selfStakePendingDeposits:
          info.pendingDeposits.length > 0
            ? info.pendingDeposits.map(d => {
                const depositEpoch = d.epoch;
                const activationEpoch = depositEpoch + ACTIVATION_DELAY_EPOCHS;
                const epochsUntilActive = activationEpoch - currentEpoch;
                return {
                  epoch: depositEpoch.toString(),
                  stake: d.stake,
                  shares: d.shares.toString(),
                  activatesAtEpoch: activationEpoch.toString(),
                  status:
                    epochsUntilActive <= 0n
                      ? "Active"
                      : `Pending (${epochsUntilActive} epoch${epochsUntilActive > 1n ? "s" : ""} remaining)`,
                };
              })
            : "None",
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

      this.succeedSpinner("Validator info retrieved", result);
    } catch (error: any) {
      this.failSpinner("Failed to get validator info", error.message || error);
    }
  }

  async getStakeInfo(options: StakingInfoOptions & {delegator?: string}): Promise<void> {
    this.startSpinner("Fetching stake info...");

    try {
      const client = await this.getReadOnlyStakingClient(options);
      const delegatorAddress = options.delegator || (await this.getSignerAddress());

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
        pendingDeposits:
          info.pendingDeposits.length > 0
            ? info.pendingDeposits.map(d => {
                const depositEpoch = d.epoch;
                const activationEpoch = depositEpoch + ACTIVATION_DELAY_EPOCHS;
                const epochsUntilActive = activationEpoch - currentEpoch;
                return {
                  epoch: depositEpoch.toString(),
                  stake: d.stake,
                  shares: d.shares.toString(),
                  activatesAtEpoch: activationEpoch.toString(),
                  status:
                    epochsUntilActive <= 0n
                      ? "Active"
                      : `Pending (${epochsUntilActive} epoch${epochsUntilActive > 1n ? "s" : ""} remaining)`,
                };
              })
            : "None",
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

      this.succeedSpinner("Stake info retrieved", result);
    } catch (error: any) {
      this.failSpinner("Failed to get stake info", error.message || error);
    }
  }

  async getEpochInfo(options: StakingConfig): Promise<void> {
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

      const now = Date.now();
      const timeUntilNext = info.nextEpochEstimate ? info.nextEpochEstimate.getTime() - now : null;

      const result = {
        currentEpoch: info.currentEpoch.toString(),
        epochStarted: info.currentEpochStart.toISOString(),
        epochEnded: info.currentEpochEnd?.toISOString() || "Not ended",
        nextEpochEstimate: info.nextEpochEstimate?.toISOString() || "N/A",
        timeUntilNextEpoch: timeUntilNext && timeUntilNext > 0 ? formatDuration(timeUntilNext) : "N/A",
        minEpochDuration: formatDuration(Number(info.epochMinDuration) * 1000),
        validatorMinStake: info.validatorMinStake,
        delegatorMinStake: info.delegatorMinStake,
        activeValidatorsCount: info.activeValidatorsCount.toString(),
        // Inflation/rewards
        epochInflation: info.inflation,
        totalWeight: info.totalWeight.toString(),
        totalClaimed: info.totalClaimed,
      };

      this.succeedSpinner("Epoch info retrieved", result);
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
}
