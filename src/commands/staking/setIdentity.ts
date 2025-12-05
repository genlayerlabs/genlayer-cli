import {StakingAction, StakingConfig} from "./StakingAction";
import type {Address} from "genlayer-js/types";
import {abi} from "genlayer-js";
import {toHex} from "viem";

export interface SetIdentityOptions extends StakingConfig {
  validator: string;
  moniker: string;
  logoUri?: string;
  website?: string;
  description?: string;
  email?: string;
  twitter?: string;
  telegram?: string;
  github?: string;
  extraCid?: string;
}

export class SetIdentityAction extends StakingAction {
  constructor() {
    super();
  }

  async execute(options: SetIdentityOptions): Promise<void> {
    this.startSpinner("Setting validator identity...");

    try {
      const validatorWallet = options.validator as Address;
      const {walletClient, publicClient} = await this.getViemClients(options);

      this.setSpinnerText(`Setting identity for ${validatorWallet}...`);

      // Convert extraCid string to bytes (hex)
      const extraCidBytes = options.extraCid ? toHex(new TextEncoder().encode(options.extraCid)) : "0x";

      const hash = await walletClient.writeContract({
        address: validatorWallet,
        abi: abi.VALIDATOR_WALLET_ABI,
        functionName: "setIdentity",
        args: [
          options.moniker,
          options.logoUri || "",
          options.website || "",
          options.description || "",
          options.email || "",
          options.twitter || "",
          options.telegram || "",
          options.github || "",
          extraCidBytes,
        ],
      });

      const receipt = await publicClient.waitForTransactionReceipt({hash});

      const output: Record<string, any> = {
        transactionHash: receipt.transactionHash,
        validator: validatorWallet,
        moniker: options.moniker,
        blockNumber: receipt.blockNumber.toString(),
        gasUsed: receipt.gasUsed.toString(),
      };

      // Add optional fields that were set
      if (options.logoUri) output.logoUri = options.logoUri;
      if (options.website) output.website = options.website;
      if (options.description) output.description = options.description;
      if (options.email) output.email = options.email;
      if (options.twitter) output.twitter = options.twitter;
      if (options.telegram) output.telegram = options.telegram;
      if (options.github) output.github = options.github;
      if (options.extraCid) output.extraCid = options.extraCid;

      this.succeedSpinner("Validator identity set!", output);
    } catch (error: any) {
      this.failSpinner("Failed to set identity", error.message || error);
    }
  }
}
