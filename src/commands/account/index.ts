import {Command} from "commander";
import {ShowAccountAction, ShowAccountOptions} from "./show";
import {CreateAccountAction, CreateAccountOptions} from "./create";
import {ImportAccountAction, ImportAccountOptions} from "./import";
import {ExportAccountAction, ExportAccountOptions} from "./export";
import {UnlockAccountAction, UnlockAccountOptions} from "./unlock";
import {LockAccountAction, LockAccountOptions} from "./lock";
import {SendAction, SendOptions} from "./send";
import {ListAccountsAction} from "./list";
import {UseAccountAction} from "./use";
import {RemoveAccountAction} from "./remove";

export function initializeAccountCommands(program: Command) {
  const accountCommand = program
    .command("account")
    .description("Manage your accounts (address, balance, keys)")
    .action(async () => {
      // Default action: show account info (use 'account show' for options)
      const showAction = new ShowAccountAction();
      await showAction.execute({});
    });

  accountCommand
    .command("list")
    .description("List all accounts")
    .action(async () => {
      const listAction = new ListAccountsAction();
      await listAction.execute();
    });

  accountCommand
    .command("show")
    .description("Show account details (address, balance)")
    .option("--rpc <rpcUrl>", "RPC URL for the network")
    .option("--account <name>", "Account to show")
    .action(async (options: ShowAccountOptions) => {
      const showAction = new ShowAccountAction();
      await showAction.execute(options);
    });

  accountCommand
    .command("create")
    .description("Create a new account with encrypted keystore")
    .requiredOption("--name <name>", "Name for the account")
    .option("--overwrite", "Overwrite existing account", false)
    .option("--no-set-active", "Do not set as active account")
    .action(async (options: CreateAccountOptions) => {
      const createAction = new CreateAccountAction();
      await createAction.execute(options);
    });

  accountCommand
    .command("import")
    .description("Import an account from a private key or keystore file")
    .requiredOption("--name <name>", "Name for the account")
    .option("--private-key <key>", "Private key to import")
    .option("--keystore <path>", "Path to keystore file to import (geth, foundry, etc.)")
    .option("--password <password>", "Password for the new keystore (skips confirmation prompt)")
    .option("--source-password <password>", "Password to decrypt source keystore (with --keystore)")
    .option("--overwrite", "Overwrite existing account", false)
    .option("--no-set-active", "Do not set as active account")
    .action(async (options: ImportAccountOptions) => {
      const importAction = new ImportAccountAction();
      await importAction.execute(options);
    });

  accountCommand
    .command("export")
    .description("Export an account to a keystore file (web3/geth/foundry compatible)")
    .requiredOption("--output <path>", "Output path for the keystore file")
    .option("--account <name>", "Account to export (defaults to active account)")
    .option("--password <password>", "Password for exported keystore (skips confirmation)")
    .option("--source-password <password>", "Password to decrypt account (if not unlocked)")
    .action(async (options: ExportAccountOptions) => {
      const exportAction = new ExportAccountAction();
      await exportAction.execute(options);
    });

  accountCommand
    .command("use <name>")
    .description("Set the active account")
    .action(async (name: string) => {
      const useAction = new UseAccountAction();
      await useAction.execute(name);
    });

  accountCommand
    .command("remove <name>")
    .description("Remove an account")
    .option("--force", "Skip confirmation prompt", false)
    .action(async (name: string, options: {force?: boolean}) => {
      const removeAction = new RemoveAccountAction();
      await removeAction.execute(name, options);
    });

  accountCommand
    .command("send <to> <amount>")
    .description("Send GEN to an address")
    .option("--rpc <rpcUrl>", "RPC URL for the network")
    .option("--network <network>", "Network to use (localnet, testnet-asimov)")
    .option("--account <name>", "Account to send from")
    .action(async (to: string, amount: string, options: {rpc?: string; network?: string; account?: string}) => {
      const sendAction = new SendAction();
      await sendAction.execute({to, amount, rpc: options.rpc, network: options.network, account: options.account});
    });

  accountCommand
    .command("unlock")
    .description("Unlock account by caching private key in OS keychain")
    .option("--account <name>", "Account to unlock")
    .action(async (options: UnlockAccountOptions) => {
      const unlockAction = new UnlockAccountAction();
      await unlockAction.execute(options);
    });

  accountCommand
    .command("lock")
    .description("Lock account by removing private key from OS keychain")
    .option("--account <name>", "Account to lock")
    .action(async (options: LockAccountOptions) => {
      const lockAction = new LockAccountAction();
      await lockAction.execute(options);
    });

  return program;
}
