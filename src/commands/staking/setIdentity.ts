import {StakingAction, StakingConfig} from "./StakingAction";
import type {
  Address,
  GenLayerClient,
  GenLayerChain,
  SetIdentityOptions as SdkSetIdentityOptions,
  StakingTransactionResult,
} from "genlayer-js/types";

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
    if (this.isBrowserWallet(options)) {
      return this.executeWithBrowserWallet(options);
    }

    this.startSpinner("Setting validator identity...");

    try {
      const validatorWallet = options.validator as Address;

      // Route through the SDK staking client rather than a raw viem
      // writeContract. The SDK's executeWrite pins `type: "legacy"` and does
      // manual nonce/gas + sign + sendRawTransaction, which the GenLayer
      // consensus RPC requires (it has no EIP-1559 fee support, so viem's
      // default fee/tx-type negotiation fails). The SDK owns the extraCid
      // encoding (hex passthrough vs UTF-8 -> hex). `setIdentity` exists on the
      // client at runtime but is missing from the installed genlayer-js
      // StakingActions .d.ts — cast to bridge that type gap.
      const client = (await this.getStakingClient(options)) as GenLayerClient<GenLayerChain> & {
        setIdentity(o: SdkSetIdentityOptions): Promise<StakingTransactionResult>;
      };

      this.setSpinnerText(`Setting identity for ${validatorWallet}...`);

      const result = await client.setIdentity({
        validator: validatorWallet,
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
        validator: validatorWallet,
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

  private async executeWithBrowserWallet(options: SetIdentityOptions): Promise<void> {
    let session;
    try {
      session = await this.getBrowserWalletSession(options, "validator-join");
    } catch (error: any) {
      this.failSpinner("Failed to set identity", error.message || error);
      return;
    }

    this.startSpinner("Confirm the transaction in your browser wallet...");
    try {
      const validatorWallet = options.validator as Address;
      // `setIdentity` exists at runtime but is missing from the installed
      // genlayer-js StakingActions .d.ts — cast to bridge that type gap. The
      // SDK owns the extraCid encoding (hex passthrough vs UTF-8 -> hex).
      const client = this.getBrowserStakingClient(options, session) as GenLayerClient<GenLayerChain> & {
        setIdentity(o: SdkSetIdentityOptions): Promise<StakingTransactionResult>;
      };

      this.log(`  From (browser wallet): ${session.signerAddress}`);
      session.setNextLabel(`Set identity (${options.moniker})`);
      const result = await client.setIdentity({
        validator: validatorWallet,
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
        validator: validatorWallet,
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
    } finally {
      await session.close();
    }
  }
}
