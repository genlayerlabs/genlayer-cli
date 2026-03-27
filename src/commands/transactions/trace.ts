import {BaseAction} from "../../lib/actions/BaseAction";
import {TransactionHash} from "genlayer-js/types";

export interface TraceParams {
  txId: TransactionHash;
  round?: number;
  rpc?: string;
}

export interface TraceOptions extends Omit<TraceParams, 'txId'> {}

export class TraceAction extends BaseAction {
  constructor() {
    super();
  }

  async trace({
    txId,
    round = 0,
    rpc,
  }: TraceParams): Promise<void> {
    const client = await this.getClient(rpc, true);
    this.startSpinner(`Fetching execution trace for ${txId} (round: ${round})...`);

    try {
      const result = await client.request({
        method: "gen_dbg_traceTransaction" as any,
        params: [{txID: txId, round}],
      });

      const trace = (result as any);
      if (!trace) {
        this.failSpinner("No trace found", `No execution trace found for transaction ${txId}`);
        return;
      }

      this.succeedSpinner("Execution trace retrieved", trace);
    } catch (error) {
      this.failSpinner("Error retrieving execution trace", error);
    }
  }
}
