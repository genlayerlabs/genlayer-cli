# GenLayer CLI

## Description

The GenLayer CLI is designed to streamline the setup and local execution of the GenLayer simulator. This tool automates the process of downloading and launching the GenLayer simulator, making it easy to start simulating and testing locally with minimal setup.

## Installation

Before installing the GenLayer CLI, ensure you have Node.js installed on your system. You can then install the CLI globally using npm:

```bash
npm install -g genlayer
```

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

EXAMPLES:
   genlayer deploy
   genlayer deploy --contract ./my_contract.gpy
   genlayer deploy --contract ./my_contract.gpy --args "arg1" "arg2" 123
   genlayer call 0x123456789abcdef greet --args "Hello World!"
   genlayer write 0x123456789abcdef updateValue --args 42
```

##### Deploy Behavior
- If `--contract` is specified, the command will **deploy the given contract**.
- If `--contract` is omitted, the CLI will **search for scripts inside the `deploy` folder**, sort them, and execute them sequentially.

##### Call vs Write
- `call` - Calls a contract method without sending a transaction or changing the state (read-only)
- `write` - Sends a transaction to a contract method that modifies the state

#### Keypair Management

Generate and manage keypairs.

```bash
USAGE:
   genlayer keygen create [options]

OPTIONS:
   --output <path>    Path to save the keypair (default: "./keypair.json")
   --overwrite        Overwrite the existing file if it already exists (default: false)

EXAMPLES:
   genlayer keygen create
   genlayer keygen create --output ./my_key.json --overwrite
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

#### Validator Management

Manage validator operations.

```bash
USAGE:
   genlayer validators <command> [options]

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
   genlayer validators get
   genlayer validators get --address 0x123456789abcdef

   genlayer validators count
   genlayer validators delete --address 0x123456789abcdef
   genlayer validators update 0x123456789abcdef --stake 100 --provider openai --model gpt-4

   genlayer validators create
   genlayer validators create --stake 50 --provider openai --model gpt-4
   genlayer validators create-random --count 3 --providers openai --models gpt-4 gpt-4o
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

## Documentation

For detailed information on how to use GenLayer CLI, please refer to our [documentation](https://docs.genlayer.com/).

## Contributing

We welcome contributions to GenLayerJS SDK! Whether it's new features, improved infrastructure, or better documentation, your input is valuable. Please read our [CONTRIBUTING](https://github.com/yeagerai/genlayer-js/blob/main/CONTRIBUTING.md) guide for guidelines on how to submit your contributions.

## License

This project is licensed under the ... License - see the [LICENSE](LICENSE) file for details.

