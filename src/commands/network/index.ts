import {Command} from "commander";
import {NetworkActions} from "./setNetwork";

export function initializeNetworkCommands(program: Command) {
  const networkActions = new NetworkActions();

  const network = program.command("network").description("Network configuration");

  // genlayer network add <alias>
  network
    .command("add")
    .description("Add a custom network profile")
    .argument("<alias>", "Custom network alias")
    .requiredOption("--base <built-in-alias>", "Built-in base network alias")
    .option("--deployment <path.json>", "Consensus deployments JSON file")
    .option("--deployment-key <dot.path>", "Deployment JSON sub-object to scan")
    .option("--rpc <url>", "Node RPC URL override")
    .option("--consensus-main <addr>", "ConsensusMain contract address override")
    .option("--consensus-data <addr>", "ConsensusData contract address override")
    .option("--staking <addr>", "Staking contract address override")
    .option("--fee-manager <addr>", "FeeManager contract address override")
    .option("--rounds-storage <addr>", "RoundsStorage contract address override")
    .option("--appeals <addr>", "Appeals contract address override")
    .option("--chain-id <n>", "Chain ID override")
    .option("--explorer <url>", "Block explorer URL for this custom network (custom networks do NOT inherit the base's explorer, to avoid misleading links)")
    .action((alias: string, options) => networkActions.addNetwork(alias, options));

  // genlayer network set [name]
  network
    .command("set")
    .description("Set the network to use")
    .argument("[network]", "The network to set")
    .action((networkName?: string) => networkActions.setNetwork(networkName));

  // genlayer network info
  network
    .command("info")
    .description("Show current network configuration and contract addresses")
    .action(() => networkActions.showInfo());

  // genlayer network list
  network
    .command("list")
    .description("List available networks")
    .action(() => networkActions.listNetworks());

  // genlayer network remove <alias>
  network
    .command("remove")
    .description("Remove a custom network profile")
    .argument("<alias>", "Custom network alias to remove")
    .action((alias: string) => networkActions.removeNetwork(alias));

  return program;
}
