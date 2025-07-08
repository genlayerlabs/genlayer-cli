import {Command} from "commander";
import {DeployAction, DeployOptions, DeployScriptsOptions} from "./deploy";
import {CallAction, CallOptions} from "./call";
import {WriteAction, WriteOptions} from "./write";

function parseArg(value: string, previous: any[] = []): any[] {
  if (value === "true") return [...previous, true];
  if (value === "false") return [...previous, false];
  if (!isNaN(Number(value))) return [...previous, Number(value)];
  return [...previous, value];
}

export function initializeContractsCommands(program: Command) {
  program
    .command("deploy")
    .description("Deploy intelligent contracts")
    .option("--contract <contractPath>", "Path to the smart contract to deploy")
    .option("--rpc <rpcUrl>", "RPC URL for the network")
    .option(
      "--args <args...>",
      "Positional arguments for the contract (space-separated, use quotes for multi-word arguments)",
      parseArg,
      [],
    )
    .action(async (options: DeployOptions) => {
      const deployer = new DeployAction();
      if (options.contract) {
        await deployer.deploy(options);
      } else {
        const deployScriptsOptions: DeployScriptsOptions = {rpc: options.rpc};
        await deployer.deployScripts(deployScriptsOptions);
      }
    });

  program
    .command("call <contractAddress> <method>")
    .description("Call a contract method without sending a transaction or changing the state")
    .option("--rpc <rpcUrl>", "RPC URL for the network")
    .option(
      "--args <args...>",
      "Positional arguments for the method (space-separated, use quotes for multi-word arguments)",
      parseArg,
      [],
    )
    .action(async (contractAddress: string, method: string, options: CallOptions) => {
      const caller = new CallAction();
      await caller.call({contractAddress, method, ...options});
    });

  program
    .command("write <contractAddress> <method>")
    .description("Sends a transaction to a contract method that modifies the state")
    .option("--rpc <rpcUrl>", "RPC URL for the network")
    .option(
      "--args <args...>",
      "Positional arguments for the method (space-separated, use quotes for multi-word arguments)",
      parseArg,
      [],
    )
    .action(async (contractAddress: string, method: string, options: WriteOptions) => {
      const writer = new WriteAction();
      await writer.write({contractAddress, method, ...options});
    });

  return program;
}
