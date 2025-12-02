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

export function initializeStakingCommands(program: Command) {
  const staking = program.command("staking").description("Staking operations for validators and delegators");

  // Validator commands
  staking
    .command("validator-join")
    .description("Join as a validator by staking tokens")
    .requiredOption("--amount <amount>", "Amount to stake (in wei or with 'eth'/'gen' suffix, e.g., '42000gen')")
    .option("--operator <address>", "Operator address (defaults to signer)")
    .option("--network <network>", "Network to use (localnet, testnet-asimov)")
    .option("--rpc <rpcUrl>", "RPC URL for the network")
    .option("--staking-address <address>", "Staking contract address (overrides chain config)")
    .action(async (options: ValidatorJoinOptions) => {
      const action = new ValidatorJoinAction();
      await action.execute(options);
    });

  staking
    .command("validator-deposit")
    .description("Make an additional deposit as a validator")
    .requiredOption("--amount <amount>", "Amount to deposit (in wei or with 'eth'/'gen' suffix)")
    .option("--network <network>", "Network to use (localnet, testnet-asimov)")
    .option("--rpc <rpcUrl>", "RPC URL for the network")
    .option("--staking-address <address>", "Staking contract address (overrides chain config)")
    .action(async (options: ValidatorDepositOptions) => {
      const action = new ValidatorDepositAction();
      await action.execute(options);
    });

  staking
    .command("validator-exit")
    .description("Exit as a validator by withdrawing shares")
    .requiredOption("--shares <shares>", "Number of shares to withdraw")
    .option("--network <network>", "Network to use (localnet, testnet-asimov)")
    .option("--rpc <rpcUrl>", "RPC URL for the network")
    .option("--staking-address <address>", "Staking contract address (overrides chain config)")
    .action(async (options: ValidatorExitOptions) => {
      const action = new ValidatorExitAction();
      await action.execute(options);
    });

  staking
    .command("validator-claim")
    .description("Claim validator withdrawals after unbonding period")
    .option("--validator <address>", "Validator address (defaults to signer)")
    .option("--network <network>", "Network to use (localnet, testnet-asimov)")
    .option("--rpc <rpcUrl>", "RPC URL for the network")
    .option("--staking-address <address>", "Staking contract address (overrides chain config)")
    .action(async (options: ValidatorClaimOptions) => {
      const action = new ValidatorClaimAction();
      await action.execute(options);
    });

  staking
    .command("validator-prime")
    .description("Prime a validator to prepare their stake record for the next epoch")
    .requiredOption("--validator <address>", "Validator address to prime")
    .option("--network <network>", "Network to use (localnet, testnet-asimov)")
    .option("--rpc <rpcUrl>", "RPC URL for the network")
    .option("--staking-address <address>", "Staking contract address (overrides chain config)")
    .action(async (options: ValidatorPrimeOptions) => {
      const action = new ValidatorPrimeAction();
      await action.execute(options);
    });

  staking
    .command("set-operator")
    .description("Change the operator address for a validator wallet")
    .requiredOption("--validator <address>", "Validator wallet address")
    .requiredOption("--operator <address>", "New operator address")
    .option("--network <network>", "Network to use (localnet, testnet-asimov)")
    .option("--rpc <rpcUrl>", "RPC URL for the network")
    .option("--staking-address <address>", "Staking contract address (overrides chain config)")
    .action(async (options: SetOperatorOptions) => {
      const action = new SetOperatorAction();
      await action.execute(options);
    });

  staking
    .command("set-identity")
    .description("Set validator identity metadata (moniker, website, socials, etc.)")
    .requiredOption("--validator <address>", "Validator wallet address")
    .requiredOption("--moniker <name>", "Validator display name")
    .option("--logo-uri <uri>", "Logo URI")
    .option("--website <url>", "Website URL")
    .option("--description <text>", "Description")
    .option("--email <email>", "Contact email")
    .option("--twitter <handle>", "Twitter handle")
    .option("--telegram <handle>", "Telegram handle")
    .option("--github <handle>", "GitHub handle")
    .option("--extra-cid <cid>", "Extra data as IPFS CID or hex bytes (0x...)")
    .option("--network <network>", "Network to use (localnet, testnet-asimov)")
    .option("--rpc <rpcUrl>", "RPC URL for the network")
    .option("--staking-address <address>", "Staking contract address (overrides chain config)")
    .action(async (options: SetIdentityOptions) => {
      const action = new SetIdentityAction();
      await action.execute(options);
    });

  // Delegator commands
  staking
    .command("delegator-join")
    .description("Join as a delegator by staking with a validator")
    .requiredOption("--validator <address>", "Validator address to delegate to")
    .requiredOption("--amount <amount>", "Amount to stake (in wei or with 'eth'/'gen' suffix)")
    .option("--network <network>", "Network to use (localnet, testnet-asimov)")
    .option("--rpc <rpcUrl>", "RPC URL for the network")
    .option("--staking-address <address>", "Staking contract address (overrides chain config)")
    .action(async (options: DelegatorJoinOptions) => {
      const action = new DelegatorJoinAction();
      await action.execute(options);
    });

  staking
    .command("delegator-exit")
    .description("Exit as a delegator by withdrawing shares from a validator")
    .requiredOption("--validator <address>", "Validator address to exit from")
    .requiredOption("--shares <shares>", "Number of shares to withdraw")
    .option("--network <network>", "Network to use (localnet, testnet-asimov)")
    .option("--rpc <rpcUrl>", "RPC URL for the network")
    .option("--staking-address <address>", "Staking contract address (overrides chain config)")
    .action(async (options: DelegatorExitOptions) => {
      const action = new DelegatorExitAction();
      await action.execute(options);
    });

  staking
    .command("delegator-claim")
    .description("Claim delegator withdrawals after unbonding period")
    .requiredOption("--validator <address>", "Validator address")
    .option("--delegator <address>", "Delegator address (defaults to signer)")
    .option("--network <network>", "Network to use (localnet, testnet-asimov)")
    .option("--rpc <rpcUrl>", "RPC URL for the network")
    .option("--staking-address <address>", "Staking contract address (overrides chain config)")
    .action(async (options: DelegatorClaimOptions) => {
      const action = new DelegatorClaimAction();
      await action.execute(options);
    });

  // Info commands
  staking
    .command("validator-info")
    .description("Get information about a validator")
    .option("--validator <address>", "Validator address (defaults to signer)")
    .option("--network <network>", "Network to use (localnet, testnet-asimov)")
    .option("--rpc <rpcUrl>", "RPC URL for the network")
    .option("--staking-address <address>", "Staking contract address (overrides chain config)")
    .action(async (options: StakingInfoOptions) => {
      const action = new StakingInfoAction();
      await action.getValidatorInfo(options);
    });

  staking
    .command("stake-info")
    .description("Get stake info for a delegator with a validator")
    .requiredOption("--validator <address>", "Validator address")
    .option("--delegator <address>", "Delegator address (defaults to signer)")
    .option("--network <network>", "Network to use (localnet, testnet-asimov)")
    .option("--rpc <rpcUrl>", "RPC URL for the network")
    .option("--staking-address <address>", "Staking contract address (overrides chain config)")
    .action(async (options: StakingInfoOptions & {delegator?: string}) => {
      const action = new StakingInfoAction();
      await action.getStakeInfo(options);
    });

  staking
    .command("epoch-info")
    .description("Get current epoch and staking parameters")
    .option("--network <network>", "Network to use (localnet, testnet-asimov)")
    .option("--rpc <rpcUrl>", "RPC URL for the network")
    .option("--staking-address <address>", "Staking contract address (overrides chain config)")
    .action(async (options: StakingInfoOptions) => {
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

  return program;
}
