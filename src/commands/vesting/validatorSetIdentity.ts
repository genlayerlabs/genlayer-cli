import {VestingAction, VestingConfig} from "./VestingAction";
import type {Address} from "genlayer-js/types";
import {toHex} from "viem";

export interface VestingValidatorSetIdentityOptions extends VestingConfig {
  wallet: string;
  moniker?: string;
  logoUri?: string;
  website?: string;
  description?: string;
  email?: string;
  twitter?: string;
  telegram?: string;
  github?: string;
  extraCid?: string;
}

export class VestingValidatorSetIdentityAction extends VestingAction {
  constructor() {
    super();
  }

  async execute(options: VestingValidatorSetIdentityOptions): Promise<void> {
    this.startSpinner("Setting vesting validator identity...");

    try {
      const client = await this.getVestingClient(options);
      const vesting = await this.resolveBeneficiaryVesting(client, options);
      const extraCid = options.extraCid ? toHex(new TextEncoder().encode(options.extraCid)) : "0x";

      this.setSpinnerText(`Setting identity for vesting validator wallet ${options.wallet}...`);

      const result = await client.vestingValidatorSetIdentity({
        vesting,
        wallet: options.wallet as Address,
        moniker: options.moniker || "",
        logoUri: options.logoUri || "",
        website: options.website || "",
        description: options.description || "",
        email: options.email || "",
        twitter: options.twitter || "",
        telegram: options.telegram || "",
        github: options.github || "",
        extraCid,
      });

      const output: Record<string, any> = {
        transactionHash: result.transactionHash,
        vesting,
        wallet: options.wallet,
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
      };

      if (options.moniker) output.moniker = options.moniker;
      if (options.logoUri) output.logoUri = options.logoUri;
      if (options.website) output.website = options.website;
      if (options.description) output.description = options.description;
      if (options.email) output.email = options.email;
      if (options.twitter) output.twitter = options.twitter;
      if (options.telegram) output.telegram = options.telegram;
      if (options.github) output.github = options.github;
      if (options.extraCid) output.extraCid = options.extraCid;

      this.succeedSpinner("Vesting validator identity set!", output);
    } catch (error: any) {
      this.failSpinner("Failed to set vesting validator identity", error.message || error);
    }
  }
}
