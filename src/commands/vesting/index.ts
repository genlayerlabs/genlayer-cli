import {Command} from "commander";
import {VestingListAction, VestingListOptions} from "./list";
import {VestingDelegateAction, VestingDelegateOptions} from "./delegate";
import {VestingUndelegateAction, VestingUndelegateOptions} from "./undelegate";
import {VestingClaimAction, VestingClaimOptions} from "./claim";
import {VestingWithdrawAction, VestingWithdrawOptions} from "./withdraw";
import {VestingValidatorCreateAction, VestingValidatorCreateOptions} from "./validatorCreate";
import {VestingValidatorDepositAction, VestingValidatorDepositOptions} from "./validatorDeposit";
import {VestingValidatorExitAction, VestingValidatorExitOptions} from "./validatorExit";
import {VestingValidatorClaimAction, VestingValidatorClaimOptions} from "./validatorClaim";
import {
  VestingValidatorCancelOperatorTransferAction,
  VestingValidatorCompleteOperatorTransferAction,
  VestingValidatorInitiateOperatorTransferAction,
  VestingValidatorOperatorTransferOptions,
} from "./validatorOperatorTransfer";
import {VestingValidatorSetIdentityAction, VestingValidatorSetIdentityOptions} from "./validatorSetIdentity";
import {VestingValidatorListAction, VestingValidatorListOptions} from "./validatorList";

function addReadOptions(command: Command): Command {
  return command
    .option("--account <name>", "Account to use (for default beneficiary address)")
    .option("--network <network>", "built-in or custom network alias (see: genlayer network list)")
    .option("--rpc <rpcUrl>", "RPC URL for the network")
    .option("--factory <address>", "VestingFactory address (overrides AddressManager lookup)")
    .option("--address-manager <address>", "AddressManager address (overrides consensus lookup)");
}

function addWriteOptions(command: Command): Command {
  return command
    .option("--vesting <address>", "Vesting contract address (overrides beneficiary lookup)")
    .option("--account <name>", "Account to use")
    .option("--password <password>", "Password to unlock account (skips interactive prompt)")
    .option("--network <network>", "built-in or custom network alias (see: genlayer network list)")
    .option("--rpc <rpcUrl>", "RPC URL for the network")
    .option("--factory <address>", "VestingFactory address (overrides AddressManager lookup)")
    .option("--address-manager <address>", "AddressManager address (overrides consensus lookup)");
}

function addValidatorReadOptions(command: Command): Command {
  return addReadOptions(
    command
      .option("--vesting <address>", "Vesting contract address (overrides beneficiary lookup)")
      .option("--beneficiary <address>", "Beneficiary address (defaults to signer)"),
  );
}

function addWalletOption(command: Command): Command {
  return command.option("--wallet <address>", "Validator wallet address (deprecated, use positional arg)");
}

function requireWallet(walletArg: string | undefined, options: {wallet?: string}): string {
  const wallet = walletArg || options.wallet;
  if (!wallet) {
    console.error("Error: validator wallet address is required");
    process.exit(1);
  }
  return wallet;
}

function requireOperator(operatorArg: string | undefined, options: {operator?: string}): string {
  const operator = operatorArg || options.operator;
  if (!operator) {
    console.error("Error: operator address is required");
    process.exit(1);
  }
  return operator;
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

  const validator = vesting.command("validator").description("Vesting-backed validator operations");

  const addCreateCommand = (name: string) => {
    addWriteOptions(
      validator
        .command(`${name} [operator]`)
        .description("Create a vesting-backed validator")
        .option("--operator <address>", "Operator address (deprecated, use positional arg)")
        .requiredOption("--amount <amount>", "Amount to self-stake (in wei or with 'eth'/'gen' suffix)"),
    ).action(async (operatorArg: string | undefined, options: VestingValidatorCreateOptions) => {
      const operator = requireOperator(operatorArg, options);
      const action = new VestingValidatorCreateAction();
      await action.execute({...options, operator});
    });
  };

  addCreateCommand("create");
  addCreateCommand("join");

  addWriteOptions(
    addWalletOption(
      validator
        .command("deposit [wallet]")
        .description("Deposit more vesting-held tokens to a validator wallet")
        .requiredOption("--amount <amount>", "Amount to deposit (in wei or with 'eth'/'gen' suffix)"),
    ),
  ).action(async (walletArg: string | undefined, options: VestingValidatorDepositOptions) => {
    const wallet = requireWallet(walletArg, options);
    const action = new VestingValidatorDepositAction();
    await action.execute({...options, wallet});
  });

  addWriteOptions(
    addWalletOption(
      validator
        .command("exit [wallet]")
        .description("Exit vesting validator self-stake by withdrawing shares")
        .requiredOption("--shares <shares>", "Number of shares to withdraw"),
    ),
  ).action(async (walletArg: string | undefined, options: VestingValidatorExitOptions) => {
    const wallet = requireWallet(walletArg, options);
    const action = new VestingValidatorExitAction();
    await action.execute({...options, wallet});
  });

  addWriteOptions(
    addWalletOption(
      validator
        .command("claim [wallet]")
        .description("Claim vesting validator withdrawals after unbonding period"),
    ),
  ).action(async (walletArg: string | undefined, options: VestingValidatorClaimOptions) => {
    const wallet = requireWallet(walletArg, options);
    const action = new VestingValidatorClaimAction();
    await action.execute({...options, wallet});
  });

  const operatorTransfer = validator.command("operator-transfer").description("Manage vesting validator operator transfers");

  addWriteOptions(
    addWalletOption(
      operatorTransfer
        .command("initiate [wallet] [newOperator]")
        .description("Initiate a vesting validator operator transfer")
        .option("--new-operator <address>", "New operator address (deprecated, use positional arg)"),
    ),
  ).action(async (walletArg: string | undefined, newOperatorArg: string | undefined, options: VestingValidatorOperatorTransferOptions) => {
    const wallet = requireWallet(walletArg, options);
    const newOperator = newOperatorArg || options.newOperator;
    if (!newOperator) {
      console.error("Error: new operator address is required");
      process.exit(1);
    }
    const action = new VestingValidatorInitiateOperatorTransferAction();
    await action.execute({...options, wallet, newOperator});
  });

  addWriteOptions(
    addWalletOption(
      operatorTransfer
        .command("complete [wallet]")
        .description("Complete a vesting validator operator transfer"),
    ),
  ).action(async (walletArg: string | undefined, options: VestingValidatorOperatorTransferOptions) => {
    const wallet = requireWallet(walletArg, options);
    const action = new VestingValidatorCompleteOperatorTransferAction();
    await action.execute({...options, wallet});
  });

  addWriteOptions(
    addWalletOption(
      operatorTransfer
        .command("cancel [wallet]")
        .description("Cancel a vesting validator operator transfer"),
    ),
  ).action(async (walletArg: string | undefined, options: VestingValidatorOperatorTransferOptions) => {
    const wallet = requireWallet(walletArg, options);
    const action = new VestingValidatorCancelOperatorTransferAction();
    await action.execute({...options, wallet});
  });

  addWriteOptions(
    addWalletOption(
      validator
        .command("set-identity [wallet]")
        .description("Set vesting validator identity metadata")
        .option("--moniker <name>", "Validator display name")
        .option("--logo-uri <uri>", "Logo URI")
        .option("--website <url>", "Website URL")
        .option("--description <text>", "Description")
        .option("--email <email>", "Contact email")
        .option("--twitter <handle>", "Twitter handle")
        .option("--telegram <handle>", "Telegram handle")
        .option("--github <handle>", "GitHub handle")
        .option("--extra-cid <cid>", "Extra data as IPFS CID or hex bytes (0x...)"),
    ),
  ).action(async (walletArg: string | undefined, options: VestingValidatorSetIdentityOptions) => {
    const wallet = requireWallet(walletArg, options);
    const action = new VestingValidatorSetIdentityAction();
    await action.execute({...options, wallet});
  });

  addValidatorReadOptions(
    validator
      .command("list")
      .description("List validator wallets owned by a vesting contract"),
  ).action(async (options: VestingValidatorListOptions) => {
    const action = new VestingValidatorListAction();
    await action.execute(options);
  });

  addValidatorReadOptions(
    validator
      .command("status")
      .description("Show validator wallets owned by a vesting contract"),
  ).action(async (options: VestingValidatorListOptions) => {
    const action = new VestingValidatorListAction();
    await action.execute(options);
  });

  return program;
}
