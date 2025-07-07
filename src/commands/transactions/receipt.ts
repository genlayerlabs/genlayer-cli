import {BaseAction} from "../../lib/actions/BaseAction";
import {TransactionHash, TransactionStatus} from "genlayer-js/types";

export interface ReceiptParams {
  txId: TransactionHash;
  status?: string | TransactionStatus;
  retries?: number;
  interval?: number;
  rpc?: string;
}

export interface ReceiptOptions extends Omit<ReceiptParams, 'txId'> {}

export class ReceiptAction extends BaseAction {
  constructor() {
    super();
  }

  private validateTransactionStatus(status: string): TransactionStatus | undefined {
    const upperStatus = status.toUpperCase() as keyof typeof TransactionStatus;
    
    if (!(upperStatus in TransactionStatus)) {
      const validStatuses = Object.values(TransactionStatus);
      this.failSpinner(
        "Invalid transaction status", 
        `Invalid status: ${status}. Valid values are: ${validStatuses.join(", ")}`
      );
      return
    }
    
    return TransactionStatus[upperStatus];
  }

  async receipt({
    txId,
    status = TransactionStatus.FINALIZED,
    retries,
    interval,
    rpc,
  }: ReceiptParams): Promise<void> {
    const client = await this.getClient(rpc);
    await client.initializeConsensusSmartContract();
    this.startSpinner(`Waiting for transaction receipt ${txId} (status: ${status})...`);

    try {
      let validatedStatus = this.validateTransactionStatus(status);

      if (!validatedStatus) {
        return;
      }
        
      const result = await client.waitForTransactionReceipt({
        hash: txId,
        status: validatedStatus,
        retries,
        interval,
      });
      
      this.succeedSpinner("Transaction receipt retrieved successfully", result);
    } catch (error) {
      this.failSpinner("Error retrieving transaction receipt", error);
    }
  }
} 