import {StakingAction, StakingConfig} from "./StakingAction";
import type {Address} from "genlayer-js/types";
import {abi} from "genlayer-js";
import {buildTx} from "../../lib/wallet/txBuilders";

export interface ValidatorClaimOptions extends StakingConfig {
  validator: string;
}

export class ValidatorClaimAction extends StakingAction {
  constructor() {
    super();
  }

  async execute(options: ValidatorClaimOptions): Promise<void> {
    if (this.isBrowserWallet(options)) {
      return this.executeWithBrowserWallet(options);
    }

    this.startSpinner("Claiming validator withdrawals...");

    try {
      const validatorWallet = options.validator as Address;

      // Route through the SDK staking client rather than a raw viem
      // writeContract. The SDK's executeWrite pins `type: "legacy"` and does
      // manual nonce/gas + sign + sendRawTransaction, which the GenLayer
      // consensus RPC requires (it has no EIP-1559 fee support, so viem's
      // default fee/tx-type negotiation fails).
      const client = await this.getStakingClient(options);

      this.setSpinnerText(`Claiming for validator ${validatorWallet}...`);

      const result = await client.validatorClaim({validator: validatorWallet});

      const output: Record<string, any> = {
        transactionHash: result.transactionHash,
        validator: validatorWallet,
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
      };

      if (result.claimedAmount !== undefined) {
        output.claimedAmount = this.formatAmount(result.claimedAmount);
      }

      this.succeedSpinner("Claim successful!", output);
    } catch (error: any) {
      this.failSpinner("Failed to claim", error.message || error);
    }
  }

  private async executeWithBrowserWallet(options: ValidatorClaimOptions): Promise<void> {
    let session;
    try {
      session = await this.getBrowserWalletSession(options, "validator-join");
    } catch (error: any) {
      this.failSpinner("Failed to claim", error.message || error);
      return;
    }

    this.startSpinner("Confirm the transaction in your browser wallet...");
    try {
      const validatorWallet = options.validator as Address;
      const {to, data} = buildTx(abi.VALIDATOR_WALLET_ABI as any, validatorWallet, "validatorClaim");

      this.log(`  From (browser wallet): ${session.signerAddress}`);
      const receipt = await session.sendTransaction({
        to,
        data,
        label: `Claim validator withdrawals`,
      });

      this.succeedSpinner("Claim successful!", {
        transactionHash: receipt.transactionHash,
        validator: validatorWallet,
        blockNumber: receipt.blockNumber.toString(),
        gasUsed: receipt.gasUsed.toString(),
      });
    } catch (error: any) {
      this.failSpinner("Failed to claim", error.message || error);
    } finally {
      await session.close();
    }
  }
}
