import {BaseAction} from "../../lib/actions/BaseAction";

export interface CallOptions {
  args: any[];
  rpc?: string;
}

export class CallAction extends BaseAction {
  constructor() {
    super();
  }

  async call({
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
    this.startSpinner(`Calling method ${method} on contract at ${contractAddress}...`);

    try {
      const result = await client.readContract({
        address: contractAddress as any,
        functionName: method,
        args,
      });
      this.succeedSpinner("Read operation successfully executed", result);
    } catch (error) {
      this.failSpinner("Error during read operation", error);
    }
  }
}
