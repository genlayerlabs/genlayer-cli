import {VestingAction, VestingConfig} from "./VestingAction";
import type {Address} from "genlayer-js/types";

export interface VestingUndelegateOptions extends VestingConfig {
  validator: string;
}

export class VestingUndelegateAction extends VestingAction {
  constructor() {
    super();
  }

  async execute(options: VestingUndelegateOptions): Promise<void> {
    if (this.isBrowserWallet(options)) {
      return this.executeWithBrowserWallet(options);
    }

    this.startSpinner("Initiating vesting undelegation...");

    try {
      const client = await this.getVestingClient(options);
      const vesting = await this.resolveBeneficiaryVesting(client, options);

      this.setSpinnerText(`Fetching vesting delegation shares for validator ${options.validator}...`);
      const stakeInfo = await client.getStakeInfo(vesting, options.validator as Address);
      const shares = stakeInfo.shares;

      if (shares <= 0n) {
        this.failSpinner(`No delegation shares found for vesting ${vesting} with validator ${options.validator}.`);
        return;
      }

      this.setSpinnerText(`Undelegating ${shares.toString()} shares from validator ${options.validator}...`);

      const result = await client.vestingDelegatorExit({
        vesting,
        validator: options.validator as Address,
        shares,
      });

      const output = {
        transactionHash: result.transactionHash,
        vesting,
        validator: options.validator,
        sharesWithdrawn: shares.toString(),
        stake: stakeInfo.stake,
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
        note: "Withdrawal will be claimable after the unbonding period",
      };

      this.succeedSpinner("Vesting undelegation initiated!", output);
    } catch (error: any) {
      this.failSpinner("Failed to undelegate vesting tokens", error.message || error);
    }
  }

  private async executeWithBrowserWallet(options: VestingUndelegateOptions): Promise<void> {
    let session;
    try {
      session = await this.getVestingBrowserSession(options);
    } catch (error: any) {
      this.failSpinner("Failed to undelegate vesting tokens", error.message || error);
      return;
    }

    this.startSpinner("Confirm the transaction in your browser wallet...");

    try {
      const client = this.getBrowserVestingClient(options, session);
      const vesting = await this.resolveBeneficiaryVesting(client, options);

      const stakeInfo = await client.getStakeInfo(vesting, options.validator as Address);
      const shares = stakeInfo.shares;

      if (shares <= 0n) {
        this.failSpinner(`No delegation shares found for vesting ${vesting} with validator ${options.validator}.`);
        return;
      }

      session.setNextLabel(`Undelegate ${shares.toString()} shares from validator`);
      const result = await client.vestingDelegatorExit({
        vesting,
        validator: options.validator as Address,
        shares,
      });

      this.succeedSpinner("Vesting undelegation initiated!", {
        transactionHash: result.transactionHash,
        vesting,
        validator: options.validator,
        sharesWithdrawn: shares.toString(),
        stake: stakeInfo.stake,
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
        note: "Withdrawal will be claimable after the unbonding period",
      });
    } catch (error: any) {
      this.failSpinner("Failed to undelegate vesting tokens", error.message || error);
    } finally {
      await session.close();
    }
  }
}
