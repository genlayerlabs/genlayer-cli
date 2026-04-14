import {TransactionHash} from "genlayer-js/types";
import {BaseAction} from "../../lib/actions/BaseAction";

export interface FinalizeOptions {
  rpc?: string;
}

export class FinalizeAction extends BaseAction {
  constructor() {
    super();
  }

  async finalize({txId, rpc}: {txId: TransactionHash; rpc?: string}): Promise<void> {
    const client = await this.getClient(rpc);

    this.startSpinner(`Finalizing transaction ${txId}...`);
    try {
      const evmHash = await client.finalizeTransaction({txId});
      this.succeedSpinner("Transaction finalized", {txId, evmTransactionHash: evmHash});
    } catch (error) {
      this.failSpinner("Error finalizing transaction", error);
    }
  }

  async finalizeBatch({txIds, rpc}: {txIds: TransactionHash[]; rpc?: string}): Promise<void> {
    if (txIds.length === 0) {
      this.failSpinner("At least one txId is required.");
      return;
    }

    const client = await this.getClient(rpc);

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
    }
  }
}
