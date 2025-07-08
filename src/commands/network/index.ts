import {Command} from "commander";
import {NetworkActions} from "./setNetwork";

export function initializeNetworkCommands(program: Command) {
  const networkActions = new NetworkActions();

  program
    .command("network")
    .description("Set the network to use")
    .argument("[network]", "The network to use")
    .action((networkName?: string) => networkActions.setNetwork(networkName));

  return program;
}
