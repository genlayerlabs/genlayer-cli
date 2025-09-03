import {Command} from "commander";
import {DeployAction, DeployOptions, DeployScriptsOptions} from "./deploy";
import {CallAction, CallOptions} from "./call";
import {WriteAction, WriteOptions} from "./write";
import {SchemaAction, SchemaOptions} from "./schema";
import {CodeAction, CodeOptions} from "./code";

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
      const callAction = new CallAction();
      await callAction.call({contractAddress, method, ...options});
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
      const writeAction = new WriteAction();
      await writeAction.write({contractAddress, method, ...options});
    });

  program
    .command("schema <contractAddress>")
    .description("Get the schema for a deployed contract")
    .option("--rpc <rpcUrl>", "RPC URL for the network")
    .action(async (contractAddress: string, options: SchemaOptions) => {
      const schemaAction = new SchemaAction();
      await schemaAction.schema({contractAddress, ...options});
    });

  program
    .command("code <contractAddress>")
    .description("Get the source for a deployed contract")
    .option("--rpc <rpcUrl>", "RPC URL for the network")
    .action(async (contractAddress: string, options: CodeOptions) => {
      const codeAction = new CodeAction();
      await codeAction.code({contractAddress, ...options});
    });

  return program;
}
