import {BaseAction} from "../../lib/actions/BaseAction";
import type {Address} from "genlayer-js/types";

export interface SchemaOptions {
  rpc?: string;
}

export class SchemaAction extends BaseAction {
  constructor() {
    super();
  }

  async schema({
    contractAddress,
    rpc,
  }: {
    contractAddress: string;
    rpc?: string;
  }): Promise<void> {
    const client = await this.getClient(rpc, true);
    await client.initializeConsensusSmartContract();
    this.startSpinner(`Getting schema for contract at ${contractAddress}...`);

    try {
      const result = await client.getContractSchema(contractAddress as Address);
      this.succeedSpinner("Contract schema retrieved successfully", result);
    } catch (error) {
      this.failSpinner("Error retrieving contract schema", error);
    }
  }
} 