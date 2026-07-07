import {VestingAction, VestingConfig} from "./VestingAction";
import type {Address} from "genlayer-js/types";

export interface VestingValidatorOperatorTransferOptions extends VestingConfig {
  wallet: string;
  newOperator?: string;
}

export class VestingValidatorInitiateOperatorTransferAction extends VestingAction {
  constructor() {
    super();
  }

  async execute(options: VestingValidatorOperatorTransferOptions): Promise<void> {
    this.startSpinner("Initiating vesting validator operator transfer...");

    try {
      if (!options.newOperator) {
        this.failSpinner("New operator address is required.");
        return;
      }

      const client = await this.getVestingClient(options);
      const vesting = await this.resolveBeneficiaryVesting(client, options);

      this.setSpinnerText(`Initiating operator transfer for wallet ${options.wallet} to ${options.newOperator}...`);

      const result = await client.vestingValidatorInitiateOperatorTransfer({
        vesting,
        wallet: options.wallet as Address,
        newOperator: options.newOperator as Address,
      });

      const output = {
        transactionHash: result.transactionHash,
        vesting,
        wallet: options.wallet,
        newOperator: options.newOperator,
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
      };

      this.succeedSpinner("Vesting validator operator transfer initiated!", output);
    } catch (error: any) {
      this.failSpinner("Failed to initiate vesting validator operator transfer", error.message || error);
    }
  }
}

export class VestingValidatorCompleteOperatorTransferAction extends VestingAction {
  constructor() {
    super();
  }

  async execute(options: VestingValidatorOperatorTransferOptions): Promise<void> {
    this.startSpinner("Completing vesting validator operator transfer...");

    try {
      const client = await this.getVestingClient(options);
      const vesting = await this.resolveBeneficiaryVesting(client, options);

      this.setSpinnerText(`Completing operator transfer for wallet ${options.wallet}...`);

      const result = await client.vestingValidatorCompleteOperatorTransfer({
        vesting,
        wallet: options.wallet as Address,
      });

      const output = {
        transactionHash: result.transactionHash,
        vesting,
        wallet: options.wallet,
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
      };

      this.succeedSpinner("Vesting validator operator transfer completed!", output);
    } catch (error: any) {
      this.failSpinner("Failed to complete vesting validator operator transfer", error.message || error);
    }
  }
}

export class VestingValidatorCancelOperatorTransferAction extends VestingAction {
  constructor() {
    super();
  }

  async execute(options: VestingValidatorOperatorTransferOptions): Promise<void> {
    this.startSpinner("Cancelling vesting validator operator transfer...");

    try {
      const client = await this.getVestingClient(options);
      const vesting = await this.resolveBeneficiaryVesting(client, options);

      this.setSpinnerText(`Cancelling operator transfer for wallet ${options.wallet}...`);

      const result = await client.vestingValidatorCancelOperatorTransfer({
        vesting,
        wallet: options.wallet as Address,
      });

      const output = {
        transactionHash: result.transactionHash,
        vesting,
        wallet: options.wallet,
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
      };

      this.succeedSpinner("Vesting validator operator transfer cancelled!", output);
    } catch (error: any) {
      this.failSpinner("Failed to cancel vesting validator operator transfer", error.message || error);
    }
  }
}
