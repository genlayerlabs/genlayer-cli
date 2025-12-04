import {StakingAction, StakingConfig} from "./StakingAction";
import type {Address} from "genlayer-js/types";

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
      const client = await this.getStakingClient(options);

      this.setSpinnerText(`Setting identity for ${options.validator}...`);

      const result = await client.setIdentity({
        validator: options.validator as Address,
        moniker: options.moniker,
        logoUri: options.logoUri,
        website: options.website,
        description: options.description,
        email: options.email,
        twitter: options.twitter,
        telegram: options.telegram,
        github: options.github,
        extraCid: options.extraCid,
      });

      const output: Record<string, any> = {
        transactionHash: result.transactionHash,
        validator: options.validator,
        moniker: options.moniker,
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
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
