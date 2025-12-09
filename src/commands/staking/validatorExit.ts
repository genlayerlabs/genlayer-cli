import {StakingAction, StakingConfig} from "./StakingAction";
import type {Address} from "genlayer-js/types";
import {abi} from "genlayer-js";

export interface ValidatorExitOptions extends StakingConfig {
  validator: string;
  shares: string;
}

export class ValidatorExitAction extends StakingAction {
  constructor() {
    super();
  }

  async execute(options: ValidatorExitOptions): Promise<void> {
    this.startSpinner("Initiating validator exit...");

    try {
      let shares: bigint;
      try {
        shares = BigInt(options.shares);
        if (shares <= 0n) throw new Error("must be positive");
      } catch {
        this.failSpinner(`Invalid shares value: "${options.shares}". Must be a positive whole number.`);
        return;
      }

      const validatorWallet = options.validator as Address;
      const {walletClient, publicClient} = await this.getViemClients(options);

      this.setSpinnerText(`Exiting validator ${validatorWallet} with ${shares} shares...`);

      const hash = await walletClient.writeContract({
        address: validatorWallet,
        abi: abi.VALIDATOR_WALLET_ABI,
        functionName: "validatorExit",
        args: [shares],
      });

      const receipt = await publicClient.waitForTransactionReceipt({hash});

      // Check epoch to determine note
      const readClient = await this.getReadOnlyStakingClient(options);
      const epochInfo = await readClient.getEpochInfo();
      const isEpochZero = epochInfo.currentEpoch === 0n;

      const output = {
        transactionHash: receipt.transactionHash,
        validator: validatorWallet,
        sharesWithdrawn: shares.toString(),
        blockNumber: receipt.blockNumber.toString(),
        gasUsed: receipt.gasUsed.toString(),
        note: isEpochZero
          ? "Epoch 0: Withdrawal claimable immediately"
          : "Withdrawal will be claimable after the unbonding period",
      };

      this.succeedSpinner("Exit initiated successfully!", output);
    } catch (error: any) {
      this.failSpinner("Failed to exit", error.message || error);
    }
  }
}
