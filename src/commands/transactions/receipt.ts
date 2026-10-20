import {BaseAction} from "../../lib/actions/BaseAction";
import type {TransactionHash, TransactionReceiptWaitUntil} from "genlayer-js/types";
import {presentTransaction, withoutAdvancedLifecycle} from "./presentation";

export interface ReceiptParams {
  txId: TransactionHash;
  waitUntil?: string | TransactionReceiptWaitUntil;
  retries?: number;
  interval?: number;
  rpc?: string;
  stdout?: boolean;
  stderr?: boolean;
  raw?: boolean;
}

export interface ReceiptOptions extends Omit<ReceiptParams, "txId"> {}

export class ReceiptAction extends BaseAction {
  constructor() {
    super();
  }

  private validateWaitUntil(waitUntil: string): TransactionReceiptWaitUntil | undefined {
    const normalized = waitUntil.toLowerCase();
    if (normalized !== "decided" && normalized !== "finalized") {
      this.failSpinner(
        "Invalid receipt wait target",
        `Invalid wait target: ${waitUntil}. Valid values are: decided, finalized`,
      );
      return;
    }
    return normalized;
  }

  async receipt({
    txId,
    waitUntil = "finalized",
    retries,
    interval,
    rpc,
    stdout,
    stderr,
    raw,
  }: ReceiptParams): Promise<void> {
    const client = await this.getClient(rpc);
    await client.initializeConsensusSmartContract();
    this.startSpinner(`Waiting for transaction receipt ${txId} (${waitUntil})...`);

    try {
      const validatedWaitUntil = this.validateWaitUntil(waitUntil);

      if (!validatedWaitUntil) {
        return;
      }

      const result = await client.waitForTransactionReceipt({
        hash: txId,
        waitUntil: validatedWaitUntil,
        retries,
        interval,
      });

      // If specific output flags are provided, print only those fields
      if (stdout || stderr) {
        const stdoutValue = (result as any)?.consensus_data?.leader_receipt[0]?.genvm_result?.stdout;
        const stderrValue = (result as any)?.consensus_data?.leader_receipt[0]?.genvm_result?.stderr;

        if (stdout && stderr) {
          this.succeedSpinner("Transaction stdout and stderr", {stdout: stdoutValue, stderr: stderrValue});
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

      if (raw) {
        this.succeedSpinner("Raw transaction receipt", result);
        return;
      }

      const presentation = presentTransaction(result);
      this.succeedSpinner(presentation.label, {
        status: presentation.label,
        ...withoutAdvancedLifecycle(result),
      });
    } catch (error) {
      this.failSpinner("Error retrieving transaction receipt", error);
    }
  }
}
