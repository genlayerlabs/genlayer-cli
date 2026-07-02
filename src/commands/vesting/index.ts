import {Command} from "commander";
import {VestingListAction, VestingListOptions} from "./list";
import {VestingDelegateAction, VestingDelegateOptions} from "./delegate";
import {VestingUndelegateAction, VestingUndelegateOptions} from "./undelegate";
import {VestingClaimAction, VestingClaimOptions} from "./claim";
import {VestingWithdrawAction, VestingWithdrawOptions} from "./withdraw";

function addReadOptions(command: Command): Command {
  return command
    .option("--account <name>", "Account to use (for default beneficiary address)")
    .option("--network <network>", "Network to use (localnet, testnet-asimov)")
    .option("--rpc <rpcUrl>", "RPC URL for the network")
    .option("--factory <address>", "VestingFactory address (overrides AddressManager lookup)")
    .option("--address-manager <address>", "AddressManager address (overrides consensus lookup)");
}

function addWriteOptions(command: Command): Command {
  return command
    .option("--vesting <address>", "Vesting contract address (overrides beneficiary lookup)")
    .option("--account <name>", "Account to use")
    .option("--password <password>", "Password to unlock account (skips interactive prompt)")
    .option("--network <network>", "Network to use (localnet, testnet-asimov)")
    .option("--rpc <rpcUrl>", "RPC URL for the network")
    .option("--factory <address>", "VestingFactory address (overrides AddressManager lookup)")
    .option("--address-manager <address>", "AddressManager address (overrides consensus lookup)");
}

export function initializeVestingCommands(program: Command) {
  const vesting = program.command("vesting").description("Vesting operations for beneficiaries");

  addReadOptions(
    vesting
      .command("list")
      .description("List beneficiary vesting contracts and state")
      .option("--beneficiary <address>", "Beneficiary address (defaults to signer)"),
  ).action(async (options: VestingListOptions) => {
    const action = new VestingListAction();
    await action.execute(options);
  });

  addWriteOptions(
    vesting
      .command("delegate [validator]")
      .description("Delegate vesting-held tokens to a validator")
      .option("--validator <address>", "Validator address to delegate to (deprecated, use positional arg)")
      .requiredOption("--amount <amount>", "Amount to delegate (in wei or with 'eth'/'gen' suffix)"),
  ).action(async (validatorArg: string | undefined, options: VestingDelegateOptions) => {
    const validator = validatorArg || options.validator;
    if (!validator) {
      console.error("Error: validator address is required");
      process.exit(1);
    }
    const action = new VestingDelegateAction();
    await action.execute({...options, validator});
  });

  addWriteOptions(
    vesting
      .command("undelegate [validator]")
      .description("Undelegate all vesting delegation shares from a validator")
      .option("--validator <address>", "Validator address to undelegate from (deprecated, use positional arg)"),
  ).action(async (validatorArg: string | undefined, options: VestingUndelegateOptions) => {
    const validator = validatorArg || options.validator;
    if (!validator) {
      console.error("Error: validator address is required");
      process.exit(1);
    }
    const action = new VestingUndelegateAction();
    await action.execute({...options, validator});
  });

  addWriteOptions(
    vesting
      .command("claim [validator]")
      .description("Claim vesting delegation withdrawals after unbonding period")
      .option("--validator <address>", "Validator address to claim from (deprecated, use positional arg)"),
  ).action(async (validatorArg: string | undefined, options: VestingClaimOptions) => {
    const validator = validatorArg || options.validator;
    if (!validator) {
      console.error("Error: validator address is required");
      process.exit(1);
    }
    const action = new VestingClaimAction();
    await action.execute({...options, validator});
  });

  addWriteOptions(
    vesting
      .command("withdraw")
      .description("Withdraw vested tokens to the beneficiary")
      .requiredOption("--amount <amount>", "Amount to withdraw (in wei or with 'eth'/'gen' suffix)"),
  ).action(async (options: VestingWithdrawOptions) => {
    const action = new VestingWithdrawAction();
    await action.execute(options);
  });

  return program;
}
