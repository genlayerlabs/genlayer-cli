import {TransactionHash} from "genlayer-js/types";
import {BaseAction} from "../../lib/actions/BaseAction";

export interface AppealOptions {
  rpc?: string;
}

export class AppealAction extends BaseAction {
  constructor() {
    super();
  }

  async appeal({
    txId,
    rpc,
  }: {
    txId: TransactionHash;
    rpc?: string;
  }): Promise<void> {
    const client = await this.getClient(rpc);
    await client.initializeConsensusSmartContract();
    this.startSpinner(`Appealing transaction ${txId}...`);

    try {
      const hash = await client.appealTransaction({
        txId,
      });

      const result = await client.waitForTransactionReceipt({
        hash,
        retries: 100,
        interval: 5000,
      });
      this.succeedSpinner("Appeal operation successfully executed", result);
    } catch (error) {
      this.failSpinner("Error during appeal operation", error);
    }
  }
} 