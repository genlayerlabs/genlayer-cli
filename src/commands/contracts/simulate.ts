import {BaseAction} from "../../lib/actions/BaseAction";

export interface SimulateWriteOptions {
  args: any[];
  rpc?: string;
  rawReturn?: boolean;
  leaderOnly?: boolean;
  transactionHashVariant?: string;
}

export class SimulateWriteAction extends BaseAction {
  constructor() {
    super();
  }

  async simulate({
    contractAddress,
    method,
    args,
    rpc,
    rawReturn,
    leaderOnly,
    transactionHashVariant,
  }: {
    contractAddress: string;
    method: string;
    args: any[];
    rpc?: string;
    rawReturn?: boolean;
    leaderOnly?: boolean;
    transactionHashVariant?: string;
  }): Promise<void> {
    const client = await this.getClient(rpc, true);
    this.startSpinner(`Simulating write method ${method} on contract at ${contractAddress}...`);

    try {
      const result = await client.simulateWriteContract({
        address: contractAddress as any,
        functionName: method,
        args,
        rawReturn,
        leaderOnly,
        transactionHashVariant: transactionHashVariant as any,
      } as any);
      this.succeedSpinner("Simulation executed successfully", result);
    } catch (error) {
      this.failSpinner("Error during write simulation", error);
    }
  }
} 