import {BaseAction} from "../../lib/actions/BaseAction";
import {TransactionHash, TransactionStatus} from "genlayer-js/types";

export interface ReceiptParams {
  txId: TransactionHash;
  status?: string | TransactionStatus;
  retries?: number;
  interval?: number;
  rpc?: string;
  stdout?: boolean;
  stderr?: boolean;
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
    stdout,
    stderr,
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

      // If specific output flags are provided, print only those fields
      if (stdout || stderr) {
        const stdoutValue = (result as any)?.consensus_data?.leader_receipt[0]?.genvm_result?.stdout;
        const stderrValue = (result as any)?.consensus_data?.leader_receipt[0]?.genvm_result?.stderr;

        if (stdout && stderr) {
          this.succeedSpinner("Transaction stdout and stderr", { stdout: stdoutValue, stderr: stderrValue });
          return;
        }

        if (stdout) {
          this.succeedSpinner("Transaction stdout retrieved successfully", stdoutValue);
          return;
        }

        if (stderr) {
          this.succeedSpinner("Transaction stderr retrieved successfully", stderrValue);
          return;
        }
      }

      // Default behavior (no flags): show full receipt result
      this.succeedSpinner("Transaction receipt retrieved successfully", result);
    } catch (error) {
      this.failSpinner("Error retrieving transaction receipt", error);
    }
  }
} 