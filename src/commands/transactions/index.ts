import {Command} from "commander";
import {TransactionStatus, TransactionHash} from "genlayer-js/types";
import {ReceiptAction, ReceiptOptions} from "./receipt";
import {AppealAction, AppealOptions} from "./appeal";

function parseIntOption(value: string, fallback: number): number {
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? fallback : parsed;
}

export function initializeTransactionsCommands(program: Command) {
  const validStatuses = Object.values(TransactionStatus).join(", ");
  
  program
    .command("receipt <txId>")
    .description("Get transaction receipt by hash")
    .option("--status <status>", `Transaction status to wait for (${validStatuses})`, TransactionStatus.FINALIZED)
    .option("--retries <retries>", "Number of retries", (value) => parseIntOption(value, 100), 100)
    .option("--interval <interval>", "Interval between retries in milliseconds", (value) => parseIntOption(value, 5000), 5000)
    .option("--rpc <rpcUrl>", "RPC URL for the network")
    .action(async (txId: TransactionHash, options: ReceiptOptions) => {
      console.log("options", options);
      const receiptAction = new ReceiptAction();
      
      await receiptAction.receipt({txId, ...options});
    })      

  program
    .command("appeal <txId>")
    .description("Appeal a transaction by its hash")
    .option("--rpc <rpcUrl>", "RPC URL for the network")
    .action(async (txId: TransactionHash, options: AppealOptions) => {
      const appealAction = new AppealAction();
      await appealAction.appeal({txId, ...options});
    });

  return program;
} 