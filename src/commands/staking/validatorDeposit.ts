import {StakingAction, StakingConfig} from "./StakingAction";
import type {Address} from "genlayer-js/types";
import {abi} from "genlayer-js";

export interface ValidatorDepositOptions extends StakingConfig {
  amount: string;
  validator: string;
}

export class ValidatorDepositAction extends StakingAction {
  constructor() {
    super();
  }

  async execute(options: ValidatorDepositOptions): Promise<void> {
    this.startSpinner("Making validator deposit...");

    try {
      const amount = this.parseAmount(options.amount);
      const validatorWallet = options.validator as Address;

      const {walletClient, publicClient} = await this.getViemClients(options);

      this.setSpinnerText(`Depositing ${this.formatAmount(amount)} to validator ${validatorWallet}...`);

      const hash = await walletClient.writeContract({
        address: validatorWallet,
        abi: abi.VALIDATOR_WALLET_ABI,
        functionName: "validatorDeposit",
        value: amount,
      });

      const receipt = await publicClient.waitForTransactionReceipt({hash});

      const output = {
        transactionHash: receipt.transactionHash,
        validator: validatorWallet,
        amount: this.formatAmount(amount),
        blockNumber: receipt.blockNumber.toString(),
        gasUsed: receipt.gasUsed.toString(),
      };

      this.succeedSpinner("Deposit successful!", output);
    } catch (error: any) {
      this.failSpinner("Failed to make deposit", error.message || error);
    }
  }
}
