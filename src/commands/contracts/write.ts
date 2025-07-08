// import {simulator} from "genlayer-js/chains";
// import type {GenLayerClient} from "genlayer-js/types";
import {BaseAction} from "../../lib/actions/BaseAction";

export interface WriteOptions {
  args: any[];
  rpc?: string;
}

export class WriteAction extends BaseAction {
  constructor() {
    super();
  }

  async write({
    contractAddress,
    method,
    args,
    rpc,
  }: {
    contractAddress: string;
    method: string;
    args: any[];
    rpc?: string;
  }): Promise<void> {
    const client = await this.getClient(rpc);
    await client.initializeConsensusSmartContract();
    this.startSpinner(`Calling write method ${method} on contract at ${contractAddress}...`);

    try {
      const hash = await client.writeContract({
        address: contractAddress as any,
        functionName: method,
        args,
        value: 0n,
      });
      this.log("Write Transaction Hash:", hash);

      const result = await client.waitForTransactionReceipt({
        hash,
        retries: 100,
        interval: 5000,
      });
      this.succeedSpinner("Write operation successfully executed", result);
    } catch (error) {
      this.failSpinner("Error during write operation", error);
    }
  }
}
