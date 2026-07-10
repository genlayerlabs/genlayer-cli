import {VestingAction, VestingConfig} from "./VestingAction";
import type {Address} from "genlayer-js/types";

export interface VestingValidatorOperatorTransferOptions extends VestingConfig {
  walletAddress: string;
  newOperator?: string;
}

export class VestingValidatorInitiateOperatorTransferAction extends VestingAction {
  constructor() {
    super();
  }

  async execute(options: VestingValidatorOperatorTransferOptions): Promise<void> {
    if (this.isBrowserWallet(options)) {
      return this.executeWithBrowserWallet(options);
    }

    this.startSpinner("Initiating vesting validator operator transfer...");

    try {
      if (!options.newOperator) {
        this.failSpinner("New operator address is required.");
        return;
      }

      const client = await this.getVestingClient(options);
      const vesting = await this.resolveBeneficiaryVesting(client, options);

      this.setSpinnerText(`Initiating operator transfer for wallet ${options.walletAddress} to ${options.newOperator}...`);

      const result = await client.vestingValidatorInitiateOperatorTransfer({
        vesting,
        wallet: options.walletAddress as Address,
        newOperator: options.newOperator as Address,
      });

      const output = {
        transactionHash: result.transactionHash,
        vesting,
        wallet: options.walletAddress,
        newOperator: options.newOperator,
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
      };

      this.succeedSpinner("Vesting validator operator transfer initiated!", output);
    } catch (error: any) {
      this.failSpinner("Failed to initiate vesting validator operator transfer", error.message || error);
    }
  }

  private async executeWithBrowserWallet(options: VestingValidatorOperatorTransferOptions): Promise<void> {
    if (!options.newOperator) {
      this.failSpinner("New operator address is required.");
      return;
    }

    let session;
    try {
      session = await this.getVestingBrowserSession(options);
    } catch (error: any) {
      this.failSpinner("Failed to initiate vesting validator operator transfer", error.message || error);
      return;
    }

    this.startSpinner("Confirm the transaction in your browser wallet...");

    try {
      const client = this.getBrowserVestingClient(options, session);
      const vesting = await this.resolveBeneficiaryVesting(client, options);

      session.setNextLabel("Initiate validator operator transfer");
      const result = await client.vestingValidatorInitiateOperatorTransfer({
        vesting,
        wallet: options.walletAddress as Address,
        newOperator: options.newOperator as Address,
      });

      this.succeedSpinner("Vesting validator operator transfer initiated!", {
        transactionHash: result.transactionHash,
        vesting,
        wallet: options.walletAddress,
        newOperator: options.newOperator,
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
      });
    } catch (error: any) {
      this.failSpinner("Failed to initiate vesting validator operator transfer", error.message || error);
    } finally {
      await session.close();
    }
  }
}

export class VestingValidatorCompleteOperatorTransferAction extends VestingAction {
  constructor() {
    super();
  }

  async execute(options: VestingValidatorOperatorTransferOptions): Promise<void> {
    if (this.isBrowserWallet(options)) {
      return this.executeWithBrowserWallet(options);
    }

    this.startSpinner("Completing vesting validator operator transfer...");

    try {
      const client = await this.getVestingClient(options);
      const vesting = await this.resolveBeneficiaryVesting(client, options);

      this.setSpinnerText(`Completing operator transfer for wallet ${options.walletAddress}...`);

      const result = await client.vestingValidatorCompleteOperatorTransfer({
        vesting,
        wallet: options.walletAddress as Address,
      });

      const output = {
        transactionHash: result.transactionHash,
        vesting,
        wallet: options.walletAddress,
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
      };

      this.succeedSpinner("Vesting validator operator transfer completed!", output);
    } catch (error: any) {
      this.failSpinner("Failed to complete vesting validator operator transfer", error.message || error);
    }
  }

  private async executeWithBrowserWallet(options: VestingValidatorOperatorTransferOptions): Promise<void> {
    let session;
    try {
      session = await this.getVestingBrowserSession(options);
    } catch (error: any) {
      this.failSpinner("Failed to complete vesting validator operator transfer", error.message || error);
      return;
    }

    this.startSpinner("Confirm the transaction in your browser wallet...");

    try {
      const client = this.getBrowserVestingClient(options, session);
      const vesting = await this.resolveBeneficiaryVesting(client, options);

      session.setNextLabel("Complete validator operator transfer");
      const result = await client.vestingValidatorCompleteOperatorTransfer({
        vesting,
        wallet: options.walletAddress as Address,
      });

      this.succeedSpinner("Vesting validator operator transfer completed!", {
        transactionHash: result.transactionHash,
        vesting,
        wallet: options.walletAddress,
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
      });
    } catch (error: any) {
      this.failSpinner("Failed to complete vesting validator operator transfer", error.message || error);
    } finally {
      await session.close();
    }
  }
}

export class VestingValidatorCancelOperatorTransferAction extends VestingAction {
  constructor() {
    super();
  }

  async execute(options: VestingValidatorOperatorTransferOptions): Promise<void> {
    if (this.isBrowserWallet(options)) {
      return this.executeWithBrowserWallet(options);
    }

    this.startSpinner("Cancelling vesting validator operator transfer...");

    try {
      const client = await this.getVestingClient(options);
      const vesting = await this.resolveBeneficiaryVesting(client, options);

      this.setSpinnerText(`Cancelling operator transfer for wallet ${options.walletAddress}...`);

      const result = await client.vestingValidatorCancelOperatorTransfer({
        vesting,
        wallet: options.walletAddress as Address,
      });

      const output = {
        transactionHash: result.transactionHash,
        vesting,
        wallet: options.walletAddress,
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
      };

      this.succeedSpinner("Vesting validator operator transfer cancelled!", output);
    } catch (error: any) {
      this.failSpinner("Failed to cancel vesting validator operator transfer", error.message || error);
    }
  }

  private async executeWithBrowserWallet(options: VestingValidatorOperatorTransferOptions): Promise<void> {
    let session;
    try {
      session = await this.getVestingBrowserSession(options);
    } catch (error: any) {
      this.failSpinner("Failed to cancel vesting validator operator transfer", error.message || error);
      return;
    }

    this.startSpinner("Confirm the transaction in your browser wallet...");

    try {
      const client = this.getBrowserVestingClient(options, session);
      const vesting = await this.resolveBeneficiaryVesting(client, options);

      session.setNextLabel("Cancel validator operator transfer");
      const result = await client.vestingValidatorCancelOperatorTransfer({
        vesting,
        wallet: options.walletAddress as Address,
      });

      this.succeedSpinner("Vesting validator operator transfer cancelled!", {
        transactionHash: result.transactionHash,
        vesting,
        wallet: options.walletAddress,
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
      });
    } catch (error: any) {
      this.failSpinner("Failed to cancel vesting validator operator transfer", error.message || error);
    } finally {
      await session.close();
    }
  }
}
