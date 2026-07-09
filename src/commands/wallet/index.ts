import {Command} from "commander";
import {WalletAction, type WalletConnectOptions} from "./WalletAction";

export function initializeWalletCommands(program: Command) {
  const wallet = new WalletAction();

  const walletCommand = program
    .command("wallet")
    .description("Manage the persistent browser-wallet (MetaMask) signing session");

  walletCommand
    .command("connect")
    .description("Start a persistent browser-wallet session (connect once, reuse across commands)")
    .option("--network <network>", "Network alias to connect on (defaults to config network)")
    .option("--rpc <rpc>", "Override the RPC URL")
    .action((options: WalletConnectOptions) => wallet.connect(options));

  walletCommand
    .command("status")
    .description("Show the current browser-wallet session (address, network, heartbeat, queue)")
    .action(() => wallet.status());

  walletCommand
    .command("disconnect")
    .description("End the active browser-wallet session")
    .action(() => wallet.disconnect());

  // Hidden: the detached daemon process entry point. Not intended for humans.
  walletCommand
    .command("daemon", {hidden: true})
    .option("--network <network>", "Network alias")
    .option("--rpc <rpc>", "Override the RPC URL")
    .action((options: WalletConnectOptions) => wallet.daemon(options));

  return program;
}
