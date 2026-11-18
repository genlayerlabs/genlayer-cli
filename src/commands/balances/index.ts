import {Command} from "commander";
import {BalancesAction, BalancesOptions} from "./BalancesAction";

export function initializeBalancesCommands(program: Command) {
  program
    .command("balances")
    .description("Show wallet + vesting balances and committed stake (read-only)")
    .option("--beneficiary <address>", "Address to inspect (defaults to the active account, no unlock)")
    .option("--network <network>", "built-in or custom network alias (see: genlayer network list)")
    .option("--rpc <rpcUrl>", "RPC URL for the network")
    .option("--account <name>", "Account whose address to use (no unlock)")
    .action(async (options: BalancesOptions) => {
      const action = new BalancesAction();
      await action.execute(options);
    });

  return program;
}
