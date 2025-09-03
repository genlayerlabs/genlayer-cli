import {BaseAction} from "../../lib/actions/BaseAction";
import type {Address} from "genlayer-js/types";

export interface CodeOptions {
  rpc?: string;
}

export class CodeAction extends BaseAction {
  constructor() {
    super();
  }

  async code({
    contractAddress,
    rpc,
  }: {
    contractAddress: string;
    rpc?: string;
  }): Promise<void> {
    const client = await this.getClient(rpc, true);
    await client.initializeConsensusSmartContract();
    this.startSpinner(`Getting code for contract at ${contractAddress}...`);

    try {
      const result = await client.getContractCode(contractAddress as Address);
      this.succeedSpinner("Contract code retrieved successfully", result);
    } catch (error) {
      this.failSpinner("Error retrieving contract code", error);
    }
  }
}


