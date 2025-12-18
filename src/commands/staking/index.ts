import {Command} from "commander";
import {ValidatorJoinAction, ValidatorJoinOptions} from "./validatorJoin";
import {ValidatorDepositAction, ValidatorDepositOptions} from "./validatorDeposit";
import {ValidatorExitAction, ValidatorExitOptions} from "./validatorExit";
import {ValidatorClaimAction, ValidatorClaimOptions} from "./validatorClaim";
import {ValidatorPrimeAction, ValidatorPrimeOptions} from "./validatorPrime";
import {SetOperatorAction, SetOperatorOptions} from "./setOperator";
import {SetIdentityAction, SetIdentityOptions} from "./setIdentity";
import {DelegatorJoinAction, DelegatorJoinOptions} from "./delegatorJoin";
import {DelegatorExitAction, DelegatorExitOptions} from "./delegatorExit";
import {DelegatorClaimAction, DelegatorClaimOptions} from "./delegatorClaim";
import {StakingInfoAction, StakingInfoOptions} from "./stakingInfo";
import {ValidatorHistoryAction, ValidatorHistoryOptions} from "./validatorHistory";
import {ValidatorWizardAction, WizardOptions} from "./wizard";

export function initializeStakingCommands(program: Command) {
  const staking = program.command("staking").description("Staking operations for validators and delegators");

  // Wizard command (main entry point for new validators)
  staking
    .command("wizard")
    .description("Interactive wizard to become a validator")
    .option("--account <name>", "Account to use (skip selection)")
    .option("--network <network>", "Network to use (skip selection)")
    .option("--skip-identity", "Skip identity setup step")
    .option("--rpc <rpcUrl>", "RPC URL for the network")
    .option("--staking-address <address>", "Staking contract address (overrides chain config)")
    .action(async (options: WizardOptions) => {
      const wizard = new ValidatorWizardAction();
      await wizard.execute(options);
    });

  // Validator commands
  staking
    .command("validator-join")
    .description("Join as a validator by staking tokens")
    .requiredOption("--amount <amount>", "Amount to stake (in wei or with 'eth'/'gen' suffix, e.g., '42000gen')")
    .option("--operator <address>", "Operator address (defaults to signer)")
    .option("--account <name>", "Account to use")
    .option("--network <network>", "Network to use (localnet, testnet-asimov)")
    .option("--rpc <rpcUrl>", "RPC URL for the network")
    .option("--staking-address <address>", "Staking contract address (overrides chain config)")
    .action(async (options: ValidatorJoinOptions) => {
      const action = new ValidatorJoinAction();
      await action.execute(options);
    });

  staking
    .command("validator-deposit [validator]")
    .description("Make an additional deposit to a validator wallet")
    .option("--validator <address>", "Validator wallet contract address (deprecated, use positional arg)")
    .requiredOption("--amount <amount>", "Amount to deposit (in wei or with 'eth'/'gen' suffix)")
    .option("--account <name>", "Account to use (must be validator owner)")
    .option("--network <network>", "Network to use (localnet, testnet-asimov)")
    .option("--rpc <rpcUrl>", "RPC URL for the network")
    .action(async (validatorArg: string | undefined, options: ValidatorDepositOptions) => {
      const validator = validatorArg || options.validator;
      if (!validator) {
        console.error("Error: validator address is required");
        process.exit(1);
      }
      const action = new ValidatorDepositAction();
      await action.execute({...options, validator});
    });

  staking
    .command("validator-exit [validator]")
    .description("Exit as a validator by withdrawing shares")
    .option("--validator <address>", "Validator wallet contract address (deprecated, use positional arg)")
    .requiredOption("--shares <shares>", "Number of shares to withdraw")
    .option("--account <name>", "Account to use (must be validator owner)")
    .option("--network <network>", "Network to use (localnet, testnet-asimov)")
    .option("--rpc <rpcUrl>", "RPC URL for the network")
    .action(async (validatorArg: string | undefined, options: ValidatorExitOptions) => {
      const validator = validatorArg || options.validator;
      if (!validator) {
        console.error("Error: validator address is required");
        process.exit(1);
      }
      const action = new ValidatorExitAction();
      await action.execute({...options, validator});
    });

  staking
    .command("validator-claim [validator]")
    .description("Claim validator withdrawals after unbonding period")
    .option("--validator <address>", "Validator wallet contract address (deprecated, use positional arg)")
    .option("--account <name>", "Account to use")
    .option("--network <network>", "Network to use (localnet, testnet-asimov)")
    .option("--rpc <rpcUrl>", "RPC URL for the network")
    .action(async (validatorArg: string | undefined, options: ValidatorClaimOptions) => {
      const validator = validatorArg || options.validator;
      if (!validator) {
        console.error("Error: validator address is required");
        process.exit(1);
      }
      const action = new ValidatorClaimAction();
      await action.execute({...options, validator});
    });

  staking
    .command("validator-prime [validator]")
    .description("Prime a validator to prepare their stake record for the next epoch")
    .option("--validator <address>", "Validator address to prime (deprecated, use positional arg)")
    .option("--account <name>", "Account to use")
    .option("--network <network>", "Network to use (localnet, testnet-asimov)")
    .option("--rpc <rpcUrl>", "RPC URL for the network")
    .option("--staking-address <address>", "Staking contract address (overrides chain config)")
    .action(async (validatorArg: string | undefined, options: ValidatorPrimeOptions) => {
      const validator = validatorArg || options.validator;
      if (!validator) {
        console.error("Error: validator address is required");
        process.exit(1);
      }
      const action = new ValidatorPrimeAction();
      await action.execute({...options, validator});
    });

  staking
    .command("set-operator [validator] [operator]")
    .description("Change the operator address for a validator wallet")
    .option("--validator <address>", "Validator wallet address (deprecated, use positional arg)")
    .option("--operator <address>", "New operator address (deprecated, use positional arg)")
    .option("--account <name>", "Account to use (must be validator owner)")
    .option("--network <network>", "Network to use (localnet, testnet-asimov)")
    .option("--rpc <rpcUrl>", "RPC URL for the network")
    .action(async (validatorArg: string | undefined, operatorArg: string | undefined, options: SetOperatorOptions) => {
      const validator = validatorArg || options.validator;
      const operator = operatorArg || options.operator;
      if (!validator || !operator) {
        console.error("Error: validator and operator addresses are required");
        process.exit(1);
      }
      const action = new SetOperatorAction();
      await action.execute({...options, validator, operator});
    });

  staking
    .command("set-identity [validator]")
    .description("Set validator identity metadata (moniker, website, socials, etc.)")
    .option("--validator <address>", "Validator wallet address (deprecated, use positional arg)")
    .requiredOption("--moniker <name>", "Validator display name")
    .option("--logo-uri <uri>", "Logo URI")
    .option("--website <url>", "Website URL")
    .option("--description <text>", "Description")
    .option("--email <email>", "Contact email")
    .option("--twitter <handle>", "Twitter handle")
    .option("--telegram <handle>", "Telegram handle")
    .option("--github <handle>", "GitHub handle")
    .option("--extra-cid <cid>", "Extra data as IPFS CID or hex bytes (0x...)")
    .option("--account <name>", "Account to use (must be validator operator)")
    .option("--network <network>", "Network to use (localnet, testnet-asimov)")
    .option("--rpc <rpcUrl>", "RPC URL for the network")
    .action(async (validatorArg: string | undefined, options: SetIdentityOptions) => {
      const validator = validatorArg || options.validator;
      if (!validator) {
        console.error("Error: validator address is required");
        process.exit(1);
      }
      const action = new SetIdentityAction();
      await action.execute({...options, validator});
    });

  // Delegator commands
  staking
    .command("delegator-join [validator]")
    .description("Join as a delegator by staking with a validator")
    .option("--validator <address>", "Validator address to delegate to (deprecated, use positional arg)")
    .requiredOption("--amount <amount>", "Amount to stake (in wei or with 'eth'/'gen' suffix)")
    .option("--account <name>", "Account to use")
    .option("--network <network>", "Network to use (localnet, testnet-asimov)")
    .option("--rpc <rpcUrl>", "RPC URL for the network")
    .option("--staking-address <address>", "Staking contract address (overrides chain config)")
    .action(async (validatorArg: string | undefined, options: DelegatorJoinOptions) => {
      const validator = validatorArg || options.validator;
      if (!validator) {
        console.error("Error: validator address is required");
        process.exit(1);
      }
      const action = new DelegatorJoinAction();
      await action.execute({...options, validator});
    });

  staking
    .command("delegator-exit [validator]")
    .description("Exit as a delegator by withdrawing shares from a validator")
    .option("--validator <address>", "Validator address to exit from (deprecated, use positional arg)")
    .requiredOption("--shares <shares>", "Number of shares to withdraw")
    .option("--account <name>", "Account to use")
    .option("--network <network>", "Network to use (localnet, testnet-asimov)")
    .option("--rpc <rpcUrl>", "RPC URL for the network")
    .option("--staking-address <address>", "Staking contract address (overrides chain config)")
    .action(async (validatorArg: string | undefined, options: DelegatorExitOptions) => {
      const validator = validatorArg || options.validator;
      if (!validator) {
        console.error("Error: validator address is required");
        process.exit(1);
      }
      const action = new DelegatorExitAction();
      await action.execute({...options, validator});
    });

  staking
    .command("delegator-claim [validator]")
    .description("Claim delegator withdrawals after unbonding period")
    .option("--validator <address>", "Validator address (deprecated, use positional arg)")
    .option("--delegator <address>", "Delegator address (defaults to signer)")
    .option("--account <name>", "Account to use")
    .option("--network <network>", "Network to use (localnet, testnet-asimov)")
    .option("--rpc <rpcUrl>", "RPC URL for the network")
    .option("--staking-address <address>", "Staking contract address (overrides chain config)")
    .action(async (validatorArg: string | undefined, options: DelegatorClaimOptions) => {
      const validator = validatorArg || options.validator;
      if (!validator) {
        console.error("Error: validator address is required");
        process.exit(1);
      }
      const action = new DelegatorClaimAction();
      await action.execute({...options, validator});
    });

  // Info commands
  staking
    .command("validator-info [validator]")
    .description("Get information about a validator")
    .option("--validator <address>", "Validator address (deprecated, use positional arg)")
    .option("--account <name>", "Account to use (for default validator address)")
    .option("--network <network>", "Network to use (localnet, testnet-asimov)")
    .option("--rpc <rpcUrl>", "RPC URL for the network")
    .option("--staking-address <address>", "Staking contract address (overrides chain config)")
    .option("--debug", "Show raw unfiltered pending deposits/withdrawals")
    .action(async (validatorArg: string | undefined, options: StakingInfoOptions) => {
      const validator = validatorArg || options.validator;
      const action = new StakingInfoAction();
      await action.getValidatorInfo({...options, validator});
    });

  staking
    .command("delegation-info [validator]")
    .description("Get delegation info for a delegator with a validator")
    .option("--validator <address>", "Validator address (deprecated, use positional arg)")
    .option("--delegator <address>", "Delegator address (defaults to signer)")
    .option("--account <name>", "Account to use (for default delegator address)")
    .option("--network <network>", "Network to use (localnet, testnet-asimov)")
    .option("--rpc <rpcUrl>", "RPC URL for the network")
    .option("--staking-address <address>", "Staking contract address (overrides chain config)")
    .action(async (validatorArg: string | undefined, options: StakingInfoOptions & {delegator?: string}) => {
      const validator = validatorArg || options.validator;
      if (!validator) {
        console.error("Error: validator address is required");
        process.exit(1);
      }
      const action = new StakingInfoAction();
      await action.getStakeInfo({...options, validator});
    });

  staking
    .command("epoch-info")
    .description("Get current epoch and staking parameters")
    .option("--epoch <number>", "Show data for specific epoch (current or previous only)")
    .option("--network <network>", "Network to use (localnet, testnet-asimov)")
    .option("--rpc <rpcUrl>", "RPC URL for the network")
    .option("--staking-address <address>", "Staking contract address (overrides chain config)")
    .action(async (options: StakingInfoOptions & {epoch?: string}) => {
      const action = new StakingInfoAction();
      await action.getEpochInfo(options);
    });

  staking
    .command("active-validators")
    .description("List all active validators")
    .option("--network <network>", "Network to use (localnet, testnet-asimov)")
    .option("--rpc <rpcUrl>", "RPC URL for the network")
    .option("--staking-address <address>", "Staking contract address (overrides chain config)")
    .action(async (options: StakingInfoOptions) => {
      const action = new StakingInfoAction();
      await action.listActiveValidators(options);
    });

  staking
    .command("quarantined-validators")
    .description("List all quarantined validators")
    .option("--network <network>", "Network to use (localnet, testnet-asimov)")
    .option("--rpc <rpcUrl>", "RPC URL for the network")
    .option("--staking-address <address>", "Staking contract address (overrides chain config)")
    .action(async (options: StakingInfoOptions) => {
      const action = new StakingInfoAction();
      await action.listQuarantinedValidators(options);
    });

  staking
    .command("banned-validators")
    .description("List all banned validators")
    .option("--network <network>", "Network to use (localnet, testnet-asimov)")
    .option("--rpc <rpcUrl>", "RPC URL for the network")
    .option("--staking-address <address>", "Staking contract address (overrides chain config)")
    .action(async (options: StakingInfoOptions) => {
      const action = new StakingInfoAction();
      await action.listBannedValidators(options);
    });

  staking
    .command("validators")
    .description("Show validator set with stake, status, and voting power")
    .option("--all", "Include banned validators")
    .option("--network <network>", "Network to use (localnet, testnet-asimov)")
    .option("--rpc <rpcUrl>", "RPC URL for the network")
    .option("--staking-address <address>", "Staking contract address (overrides chain config)")
    .action(async (options: StakingInfoOptions & {all?: boolean}) => {
      const action = new StakingInfoAction();
      await action.listValidators(options);
    });

  staking
    .command("validator-history [validator]")
    .description("Show slash and reward history for a validator (default: last 10 epochs)")
    .option("--validator <address>", "Validator address (deprecated, use positional arg)")
    .option("--epochs <count>", "Number of recent epochs to fetch (default: 10)")
    .option("--from-epoch <epoch>", "Start from this epoch number")
    .option("--from-block <block>", "Start from this block number (advanced)")
    .option("--all", "Fetch complete history from genesis (slow)")
    .option("--limit <count>", "Maximum number of events to show (default: 50)")
    .option("--account <name>", "Account to use (for default validator address)")
    .option("--network <network>", "Network to use (localnet, testnet-asimov)")
    .option("--rpc <rpcUrl>", "RPC URL for the network")
    .option("--staking-address <address>", "Staking contract address (overrides chain config)")
    .action(async (validatorArg: string | undefined, options: ValidatorHistoryOptions) => {
      const validator = validatorArg || options.validator;
      const action = new ValidatorHistoryAction();
      await action.execute({...options, validator});
    });

  return program;
}
