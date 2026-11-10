import {TransactionHash} from "genlayer-js/types";
import {BaseAction} from "../../lib/actions/BaseAction";

export interface FinalizeOptions {
  rpc?: string;
  wallet?: "keystore" | "browser";
}

export class FinalizeAction extends BaseAction {
  constructor() {
    super();
  }

  async finalize({
    txId,
    rpc,
    wallet,
  }: {
    txId: TransactionHash;
    rpc?: string;
    wallet?: "keystore" | "browser";
  }): Promise<void> {
    if (this.isBrowserWallet({wallet})) this.walletModeOverride = "browser";
    const client = await this.getClient(rpc);
    this.browserSession?.setNextLabel(`Finalize ${txId}`);

    this.startSpinner(`Finalizing transaction ${txId}...`);
    try {
      const evmHash = await client.finalizeTransaction({txId});
      this.succeedSpinner("Transaction finalized", {txId, evmTransactionHash: evmHash});
    } catch (error) {
      this.failSpinner("Error finalizing transaction", error);
    } finally {
      await this.closeBrowserSession();
    }
  }

  async finalizeBatch({
    txIds,
    rpc,
    wallet,
  }: {
    txIds: TransactionHash[];
    rpc?: string;
    wallet?: "keystore" | "browser";
  }): Promise<void> {
    if (txIds.length === 0) {
      this.failSpinner("At least one txId is required.");
      return;
    }

    if (this.isBrowserWallet({wallet})) this.walletModeOverride = "browser";
    const client = await this.getClient(rpc);
    this.browserSession?.setNextLabel(`Finalize ${txIds.length} idle transaction(s)`);

    this.startSpinner(`Finalizing ${txIds.length} idle transaction(s)...`);
    try {
      const evmHash = await client.finalizeIdlenessTxs({txIds});
      this.succeedSpinner("Idle transactions finalized", {
        count: txIds.length,
        txIds,
        evmTransactionHash: evmHash,
      });
    } catch (error) {
      this.failSpinner("Error finalizing idle transactions", error);
    } finally {
      await this.closeBrowserSession();
    }
  }
}
