# GenLayer CLI

## Description

The GenLayer CLI is designed to streamline the setup and local execution of the GenLayer simulator. This tool automates the process of downloading and launching the GenLayer simulator, making it easy to start simulating and testing locally with minimal setup.

## Installation

Before installing the GenLayer CLI, ensure you have Node.js installed on your system. You can then install the CLI globally using npm:

```bash
npm install -g genlayer
```

### Linux Dependencies

On some Linux distributions with minimal setups (like Debian netinst or Docker images), you may need to manually install libsecret:

```bash
# Ubuntu/Debian
sudo apt-get install libsecret-1-0

# CentOS/RHEL/Fedora
sudo yum install libsecret
# or for newer versions
sudo dnf install libsecret

# Arch Linux
sudo pacman -S libsecret
```

The GenLayer CLI uses the `keytar` library for secure key storage, which relies on `libsecret` on Linux systems.

## Usage

Each command includes syntax, usage information, and examples to help you effectively use the CLI for interacting with the GenLayer environment.

### Command line syntax

General syntax for using the GenLayer CLI:

```bash
genlayer command [command options] [arguments...]
```

### Commands and usage

#### Initialize

Prepares and verifies your environment to run the GenLayer Studio.

```bash
USAGE:
   genlayer init [options]

OPTIONS:
   --numValidators <numValidators>       Number of validators (default: "5")
   --headless                            Headless mode (default: false)
   --reset-db                            Reset Database (default: false)
   --localnet-version <localnetVersion>  Select a specific localnet version
   --ollama                              Enable Ollama container (default: false)

EXAMPLES:
   genlayer init
   genlayer init --numValidators 10 --headless --reset-db --localnet-version v0.10.2
   genlayer init --ollama
```

##### Version Compatibility

The GenLayer CLI always uses the latest compatible version of the environment, ensuring that you benefit from the most recent features, bug fixes, and optimizations without requiring manual updates. If a specific version is needed, you can specify it using the --localnet-version option when initializing the environment.

```bash
genlayer init --localnet-version v0.10.2
```

#### Start GenLayer environment

Launches the GenLayer environment and the Studio, initializing a fresh set of database and accounts.

```bash
USAGE:
   genlayer up [options]

OPTIONS:
   --reset-validators               Remove all current validators and create new random ones (default: false)
   --numValidators <numValidators>  Number of validators (default: "5")
   --headless                       Headless mode (default: false)
   --reset-db                       Reset Database (default: false)
   --ollama                         Enable Ollama container (default: false)

EXAMPLES:
   genlayer up
   genlayer up --reset-validators --numValidators 8 --headless --reset-db
   genlayer up --ollama
```

#### Stop GenLayer environment

Stops all running GenLayer Localnet services.

```bash
USAGE:
   genlayer stop
```

#### Create a New GenLayer Project

Initialize a new GenLayer project using a local template.

```bash
USAGE:
   genlayer new <projectName> [options]

OPTIONS:
   --path <directory>  Specify the directory for the new project (default: ".")
   --overwrite         Overwrite existing directory if it exists (default: false)

EXAMPLES:
   genlayer new myProject
   genlayer new myProject --path ./customDir
   genlayer new myProject --overwrite
```

#### Manage CLI Configuration

Configure the GenLayer CLI settings.

```bash
USAGE:
   genlayer config <command> [options]

COMMANDS:
   set <key=value>  Set a configuration value
   get [key]        Get the current configuration
   reset <key>      Reset a configuration value to its default

EXAMPLES:
   genlayer config get
   genlayer config get defaultOllamaModel
   genlayer config set defaultOllamaModel=deepseek-r1
   genlayer config reset keyPairPath
```

#### Network Management

Set the network to use for contract operations.

```bash
USAGE:
   genlayer network [network]

EXAMPLES:
   genlayer network
   genlayer network testnet
   genlayer network mainnet
```

#### Deploy and Call Intelligent Contracts

Deploy and interact with intelligent contracts.

```bash
USAGE:
   genlayer deploy [options]
   genlayer call <contractAddress> <method> [options]
   genlayer write <contractAddress> <method> [options]
   genlayer schema <contractAddress> [options]

OPTIONS (deploy):
   --contract <contractPath>  (Optional) Path to the intelligent contract to deploy
   --rpc <rpcUrl>             RPC URL for the network
   --args <args...>           Positional arguments for the contract (space-separated, use quotes for multi-word arguments)

OPTIONS (call):
   --rpc <rpcUrl>             RPC URL for the network
   --args <args...>           Positional arguments for the method (space-separated, use quotes for multi-word arguments)

OPTIONS (write):
   --rpc <rpcUrl>             RPC URL for the network
   --args <args...>           Positional arguments for the method (space-separated, use quotes for multi-word arguments)

OPTIONS (schema):
   --rpc <rpcUrl>             RPC URL for the network

EXAMPLES:
   genlayer deploy
   genlayer deploy --contract ./my_contract.gpy
   genlayer deploy --contract ./my_contract.gpy --args "arg1" "arg2" 123
   genlayer call 0x123456789abcdef greet --args "Hello World!"
   genlayer write 0x123456789abcdef updateValue --args 42
   genlayer schema 0x123456789abcdef
```

##### Deploy Behavior
- If `--contract` is specified, the command will **deploy the given contract**.
- If `--contract` is omitted, the CLI will **search for scripts inside the `deploy` folder**, sort them, and execute them sequentially.

##### Call vs Write
- `call` - Calls a contract method without sending a transaction or changing the state (read-only)
- `write` - Sends a transaction to a contract method that modifies the state

##### Schema
- `schema` - Retrieves the contract schema

#### Account Management

View and manage your account.

```bash
USAGE:
   genlayer account                   Show account info (address, balance, network, status)
   genlayer account create [options]  Create a new account
   genlayer account send <to> <amount> Send GEN to an address
   genlayer account unlock            Unlock account (cache key in OS keychain)
   genlayer account lock              Lock account (remove key from OS keychain)

OPTIONS (create):
   --output <path>    Path to save the keystore (default: "./keypair.json")
   --overwrite        Overwrite existing file (default: false)

EXAMPLES:
   genlayer account
   genlayer account create
   genlayer account create --output ./my_key.json --overwrite
   genlayer account send 0x123...abc 10gen
   genlayer account send 0x123...abc 0.5gen
   genlayer account unlock
   genlayer account lock
```

#### Update Resources

Manage and update models or configurations.

```bash
USAGE:
   genlayer update ollama [options]

OPTIONS:
   --model [model-name]  Specify the model to update or pull
   --remove              Remove the specified model instead of updating

EXAMPLES:
   genlayer update ollama
   genlayer update ollama --model deepseek-r1
   genlayer update ollama --model deepseek-r1 --remove
```

#### Localnet Validator Management

Manage localnet validator operations.

```bash
USAGE:
   genlayer localnet validators <command> [options]

COMMANDS:
   get [--address <validatorAddress>]     Retrieve details of a specific validator or all validators
   delete [--address <validatorAddress>]  Delete a specific validator or all validators
   count                                  Count all validators
   update <validatorAddress> [options]    Update a validator details
   create-random [options]                Create random validators
   create [options]                       Create a new validator

OPTIONS (update):
   --stake <stake>                        New stake for the validator
   --provider <provider>                  New provider for the validator
   --model <model>                        New model for the validator
   --config <config>                      New JSON config for the validator

OPTIONS (create-random):
   --count <count>                        Number of validators to create (default: "1")
   --providers <providers...>             Space-separated list of provider names (e.g., openai ollama)
   --models <models...>                   Space-separated list of model names (e.g., gpt-4 gpt-4o)

OPTIONS (create):
   --stake <stake>                        Stake amount for the validator (default: "1")
   --config <config>                      Optional JSON configuration for the validator
   --provider <provider>                  Specify the provider for the validator
   --model <model>                        Specify the model for the validator

EXAMPLES:
   genlayer localnet validators get
   genlayer localnet validators get --address 0x123456789abcdef

   genlayer localnet validators count
   genlayer localnet validators delete --address 0x123456789abcdef
   genlayer localnet validators update 0x123456789abcdef --stake 100 --provider openai --model gpt-4

   genlayer localnet validators create
   genlayer localnet validators create --stake 50 --provider openai --model gpt-4
   genlayer localnet validators create-random --count 3 --providers openai --models gpt-4 gpt-4o
```

#### Staking Operations

Manage staking for validators and delegators on testnet-asimov. Staking is not available on localnet/studio.

```bash
USAGE:
   genlayer staking <command> [options]

COMMANDS:
   validator-join [options]      Join as a validator by staking tokens
   validator-deposit [options]   Make an additional deposit as a validator
   validator-exit [options]      Exit as a validator by withdrawing shares
   validator-claim [options]     Claim validator withdrawals after unbonding period
   delegator-join [options]      Join as a delegator by staking with a validator
   delegator-exit [options]      Exit as a delegator by withdrawing shares
   delegator-claim [options]     Claim delegator withdrawals after unbonding period
   validator-info [options]      Get information about a validator
   delegation-info [options]     Get delegation info for a delegator with a validator
   epoch-info [options]          Get epoch info with timing estimates
   active-validators [options]   List all active validators

COMMON OPTIONS (all commands):
   --network <network>           Network to use (localnet, testnet-asimov)
   --rpc <rpcUrl>                RPC URL override
   --staking-address <address>   Staking contract address override

OPTIONS (validator-join):
   --amount <amount>             Amount to stake (in wei or with 'gen' suffix)
   --operator <address>          Operator address (defaults to signer)

OPTIONS (delegator-join):
   --validator <address>         Validator address to delegate to
   --amount <amount>             Amount to stake (in wei or with 'gen' suffix)

OPTIONS (exit commands):
   --shares <shares>             Number of shares to withdraw
   --validator <address>         Validator address (for delegator commands)

EXAMPLES:
   # Get epoch info (uses --network to specify testnet-asimov)
   genlayer staking epoch-info --network testnet-asimov

   # Or set network globally first
   genlayer network testnet-asimov

   # Join as validator with 42000 GEN
   genlayer staking validator-join --amount 42000gen

   # Join as delegator with 42 GEN
   genlayer staking delegator-join --validator 0x... --amount 42gen

   # Check validator info
   genlayer staking validator-info --validator 0x...
   # Output:
   # {
   #   validator: '0xa8f1BF1e5e709593b4468d7ac5DC315Ea3CAe130',
   #   vStake: '0.01 GEN',
   #   vShares: '10000000000000000',
   #   dStake: '0 GEN',
   #   dShares: '0',
   #   vDeposit: '0 GEN',
   #   vWithdrawal: '0 GEN',
   #   epoch: '0',
   #   live: true,
   #   banned: 'Not banned'
   # }

   # Get current epoch info (includes timing estimates)
   genlayer staking epoch-info
   # Output:
   # {
   #   currentEpoch: '2',
   #   epochStarted: '2025-11-28T09:57:49.000Z',
   #   epochEnded: 'Not ended',
   #   nextEpochEstimate: '2025-11-29T09:57:49.000Z',
   #   timeUntilNextEpoch: '19h 56m',
   #   minEpochDuration: '24h 0m',
   #   validatorMinStake: '0.01 GEN',
   #   delegatorMinStake: '42 GEN',
   #   activeValidatorsCount: '6'
   # }

   # List active validators
   genlayer staking active-validators
   # Output:
   # {
   #   count: 6,
   #   validators: [
   #     '0xa8f1BF1e5e709593b4468d7ac5DC315Ea3CAe130',
   #     '0xe9246A020cbb4fC6C46e60677981879c9219e8B9',
   #     ...
   #   ]
   # }

   # Exit and claim
   genlayer staking validator-exit --shares 100
   genlayer staking validator-claim
```

### Running the CLI from the repository

First, install the dependencies and start the build process

```bash
npm install
npm run dev
```

This will continuously rebuild the CLI from the source

Then in another window execute the CLI commands like so:

```bash
node dist/index.js init
```

## Guides

- [Validator Guide](docs/validator-guide.md) - How to become a validator on GenLayer testnet
- [Delegator Guide](docs/delegator-guide.md) - How to delegate GEN to a validator

## Documentation

For detailed information on how to use GenLayer CLI, please refer to our [documentation](https://docs.genlayer.com/).

## Contributing

We welcome contributions to GenLayerJS SDK! Whether it's new features, improved infrastructure, or better documentation, your input is valuable. Please read our [CONTRIBUTING](https://github.com/yeagerai/genlayer-js/blob/main/CONTRIBUTING.md) guide for guidelines on how to submit your contributions.

## License

This project is licensed under the ... License - see the [LICENSE](LICENSE) file for details.

