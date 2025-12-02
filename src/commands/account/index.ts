import {Command} from "commander";
import {ShowAccountAction} from "./show";
import {CreateAccountAction, CreateAccountOptions} from "./create";
import {ImportAccountAction, ImportAccountOptions} from "./import";
import {UnlockAccountAction} from "./unlock";
import {LockAccountAction} from "./lock";
import {SendAction, SendOptions} from "./send";

export function initializeAccountCommands(program: Command) {
  const accountCommand = program
    .command("account")
    .description("Manage your account (address, balance, keys)")
    .action(async () => {
      // Default action: show account info
      const showAction = new ShowAccountAction();
      await showAction.execute();
    });

  accountCommand
    .command("create")
    .description("Create a new account with encrypted keystore")
    .option("--output <path>", "Path to save the keystore", "./keypair.json")
    .option("--overwrite", "Overwrite existing file", false)
    .action(async (options: CreateAccountOptions) => {
      const createAction = new CreateAccountAction();
      await createAction.execute(options);
    });

  accountCommand
    .command("import")
    .description("Import an account from a private key")
    .option("--private-key <key>", "Private key to import (will prompt if not provided)")
    .option("--output <path>", "Path to save the keystore", "./keypair.json")
    .option("--overwrite", "Overwrite existing file", false)
    .action(async (options: ImportAccountOptions) => {
      const importAction = new ImportAccountAction();
      await importAction.execute(options);
    });

  accountCommand
    .command("send <to> <amount>")
    .description("Send GEN to an address")
    .option("--rpc <rpcUrl>", "RPC URL for the network")
    .option("--network <network>", "Network to use (localnet, testnet-asimov)")
    .action(async (to: string, amount: string, options: {rpc?: string; network?: string}) => {
      const sendAction = new SendAction();
      await sendAction.execute({to, amount, rpc: options.rpc, network: options.network});
    });

  accountCommand
    .command("unlock")
    .description("Unlock account by caching private key in OS keychain")
    .action(async () => {
      const unlockAction = new UnlockAccountAction();
      await unlockAction.execute();
    });

  accountCommand
    .command("lock")
    .description("Lock account by removing private key from OS keychain")
    .action(async () => {
      const lockAction = new LockAccountAction();
      await lockAction.execute();
    });

  return program;
}
