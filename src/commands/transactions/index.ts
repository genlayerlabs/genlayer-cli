import {Command} from "commander";
import {TransactionHash} from "genlayer-js/types";
import {AppealAction, AppealOptions} from "./appeal";

export function initializeTransactionsCommands(program: Command) {
  program
    .command("appeal <txId>")
    .description("Appeal a transaction by its hash")
    .option("--rpc <rpcUrl>", "RPC URL for the network")
    .action(async (txId: TransactionHash, options: AppealOptions) => {
      const appealer = new AppealAction();
      await appealer.appeal({txId, ...options});
    });

  return program;
} 