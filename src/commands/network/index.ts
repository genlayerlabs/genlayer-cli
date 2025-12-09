import {Command} from "commander";
import {NetworkActions} from "./setNetwork";

export function initializeNetworkCommands(program: Command) {
  const networkActions = new NetworkActions();

  const network = program.command("network").description("Network configuration");

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

  return program;
}
