// import {simulator} from "genlayer-js/chains";
// import type {GenLayerClient} from "genlayer-js/types";
import {BaseAction} from "../../lib/actions/BaseAction";
import {ContractFeeCliOptions, parseTransactionFees, parseValidUntil} from "./fees";

export interface WriteOptions extends ContractFeeCliOptions {
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
    fees,
    feeValue,
    validUntil,
  }: {
    contractAddress: string;
    method: string;
    args: any[];
    rpc?: string;
    fees?: string;
    feeValue?: string;
    validUntil?: string;
  }): Promise<void> {
    const client = await this.getClient(rpc);
    await client.initializeConsensusSmartContract();
    this.startSpinner(`Calling write method ${method} on contract at ${contractAddress}...`);

    try {
      const writeParams: any = {
        address: contractAddress as any,
        functionName: method,
        args,
        value: 0n,
      };
      const parsedFees = parseTransactionFees({fees, feeValue, validUntil});
      const parsedValidUntil = parseValidUntil({fees, feeValue, validUntil});
      if (parsedFees) writeParams.fees = parsedFees;
      if (parsedValidUntil !== undefined) writeParams.validUntil = parsedValidUntil;

      const hash = await client.writeContract(writeParams);
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
