import {StakingAction, StakingConfig} from "./StakingAction";
import type {Address} from "genlayer-js/types";
import {abi} from "genlayer-js";

export interface ValidatorClaimOptions extends StakingConfig {
  validator: string;
}

export class ValidatorClaimAction extends StakingAction {
  constructor() {
    super();
  }

  async execute(options: ValidatorClaimOptions): Promise<void> {
    this.startSpinner("Claiming validator withdrawals...");

    try {
      const validatorWallet = options.validator as Address;
      const {walletClient, publicClient} = await this.getViemClients(options);

      this.setSpinnerText(`Claiming for validator ${validatorWallet}...`);

      const hash = await walletClient.writeContract({
        address: validatorWallet,
        abi: abi.VALIDATOR_WALLET_ABI,
        functionName: "validatorClaim",
      });

      const receipt = await publicClient.waitForTransactionReceipt({hash});

      const output = {
        transactionHash: receipt.transactionHash,
        validator: validatorWallet,
        blockNumber: receipt.blockNumber.toString(),
        gasUsed: receipt.gasUsed.toString(),
      };

      this.succeedSpinner("Claim successful!", output);
    } catch (error: any) {
      this.failSpinner("Failed to claim", error.message || error);
    }
  }
}
