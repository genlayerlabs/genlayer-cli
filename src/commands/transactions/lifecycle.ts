import {BaseAction} from "../../lib/actions/BaseAction";
import type {TransactionHash} from "genlayer-js/types";

export interface LifecycleOptions {
  rpc?: string;
  timestamp?: number;
}

export class LifecycleAction extends BaseAction {
  async lifecycle({txId, rpc, timestamp}: LifecycleOptions & {txId: TransactionHash}): Promise<void> {
    this.startSpinner(`Reading advanced lifecycle for ${txId}...`);
    try {
      const client = await this.getClient(rpc, true);
      const request = client.request as unknown as (args: {
        method: string;
        params: unknown[];
      }) => Promise<unknown>;
      const lifecycle = await request({
        method: "gen_getTransactionLifecycle",
        params: [{txId, ...(timestamp === undefined ? {} : {timestamp})}],
      });
      this.succeedSpinner("Advanced transaction lifecycle", lifecycle);
    } catch (error) {
      this.failSpinner("Error retrieving advanced transaction lifecycle", error);
    }
  }
}
