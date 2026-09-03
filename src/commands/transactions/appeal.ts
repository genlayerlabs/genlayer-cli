import {TransactionHash} from "genlayer-js/types";
import {parseStakingAmount, formatStakingAmount} from "genlayer-js";
import {BaseAction} from "../../lib/actions/BaseAction";

export interface AppealOptions {
  rpc?: string;
  bond?: string;
  wallet?: "keystore" | "browser";
}

export interface AppealBondOptions {
  rpc?: string;
}

export class AppealAction extends BaseAction {
  constructor() {
    super();
  }

  async appeal({
    txId,
    rpc,
    bond,
    wallet,
  }: {
    txId: TransactionHash;
    rpc?: string;
    bond?: string;
    wallet?: "keystore" | "browser";
  }): Promise<void> {
    if (this.isBrowserWallet({wallet})) this.walletModeOverride = "browser";
    const client = await this.getClient(rpc);
    this.browserSession?.setNextLabel(`Appeal ${txId}`);

    try {
      let value: bigint | undefined;
      if (bond) {
        value = parseStakingAmount(bond);
      } else {
        this.startSpinner("Calculating appeal bond...");
        try {
          value = await client.getMinAppealBond({txId});
          this.stopSpinner();
          this.logInfo(`Appeal bond: ${formatStakingAmount(value)}`);
        } catch {
          this.stopSpinner();
          value = undefined;
        }
      }

      await this.confirmPrompt("Proceed with appeal?");

      this.startSpinner(`Appealing transaction ${txId}...`);
      const hash = await client.appealTransaction({
        txId,
        value,
      });

      this.setSpinnerText("Waiting for finalization...");
      const result = await client.waitForTransactionReceipt({
        hash,
        retries: 100,
        interval: 5000,
      });
      this.succeedSpinner("Appeal successfully executed", result);
    } catch (error) {
      this.failSpinner("Error during appeal operation", error);
    } finally {
      await this.closeBrowserSession();
    }
  }

  async appealBond({
    txId,
    rpc,
  }: {
    txId: TransactionHash;
    rpc?: string;
  }): Promise<void> {
    const client = await this.getClient(rpc, true);
    this.startSpinner(`Calculating appeal bond for ${txId}...`);

    try {
      const bond = await client.getMinAppealBond({txId});
      this.succeedSpinner(`Minimum appeal bond: ${formatStakingAmount(bond)}`);
    } catch (error) {
      this.failSpinner("Error calculating appeal bond", error);
    }
  }
}
