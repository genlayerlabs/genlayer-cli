import {Command} from "commander";
import {CalldataAddress} from "genlayer-js/types";
import {DeployAction, DeployOptions, DeployScriptsOptions} from "./deploy";
import {CallAction, CallOptions} from "./call";
import {WriteAction, WriteOptions} from "./write";
import {SchemaAction, SchemaOptions} from "./schema";
import {CodeAction, CodeOptions} from "./code";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const ADDR_PREFIX_RE = /^addr#([0-9a-fA-F]{40})$/;
const BYTES_PREFIX_RE = /^b#([0-9a-fA-F]*)$/;
const HEX_RE = /^0x[0-9a-fA-F]+$/;

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function coerceValue(value: unknown): unknown {
  if (value === null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (Number.isSafeInteger(value)) return value;
    return BigInt(value);
  }
  if (Array.isArray(value)) return value.map(coerceValue);
  if (typeof value === "object" && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = coerceValue(v);
    }
    return result;
  }
  if (typeof value === "string") return parseScalar(value);
  return value;
}

export function parseScalar(value: string): unknown {
  if (value === "null") return null;
  if (value === "true") return true;
  if (value === "false") return false;

  const addrMatch = value.match(ADDR_PREFIX_RE);
  if (addrMatch) return new CalldataAddress(hexToBytes(addrMatch[1]));
  if (ADDRESS_RE.test(value)) return new CalldataAddress(hexToBytes(value.slice(2)));

  const bytesMatch = value.match(BYTES_PREFIX_RE);
  if (bytesMatch) return hexToBytes(bytesMatch[1]);

  if (HEX_RE.test(value)) return BigInt(value);
  if (!isNaN(Number(value)) && Number.isSafeInteger(Number(value))) return Number(value);
  if (!isNaN(Number(value))) return BigInt(value);

  return value;
}

export function parseArg(value: string, previous: any[] = []): any[] {
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === "object" || Array.isArray(parsed)) {
      return [...previous, coerceValue(parsed)];
    }
  } catch {
    // not JSON, fall through to scalar parsing
  }
  return [...previous, parseScalar(value)];
}

const ARGS_HELP = [
  "Contract arguments. Supported types:",
  "  bool: true, false",
  "  null: null",
  "  int: 42, -1, 0x1a (large values auto-use BigInt)",
  '  str: hello, "multi word"',
  "  address: 0x6857...a0 (40 hex chars) or addr#6857...a0",
  "  bytes: b#deadbeef",
  '  array: \'[1, 2, "three"]\'',
  '  dict: \'{"key": "value"}\'',
].join("\n");

export function initializeContractsCommands(program: Command) {
  program
    .command("deploy")
    .description("Deploy intelligent contracts")
    .option("--contract <contractPath>", "Path to the smart contract to deploy")
    .option("--rpc <rpcUrl>", "RPC URL for the network")
    .option("--args <args...>", ARGS_HELP, parseArg, [])
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
      ARGS_HELP,
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
      ARGS_HELP,
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
