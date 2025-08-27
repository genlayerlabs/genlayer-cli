import { Command } from "commander";
import { ValidatorsAction } from "./validators";

export function initializeValidatorCommands(program: Command) {
  const validatorsAction = new ValidatorsAction();

  const localnetCommand = program
    .command("localnet")
    .description("Manage localnet operations");

  const validatorsCommand = localnetCommand
    .command("validators")
    .description("Manage localnet validators operations");

  validatorsCommand
    .command("get")

    .description("Retrieve details of a specific validator or all validators")
    .option("--address <validatorAddress>", "The address of the validator to retrieve (omit to retrieve all validators)")
    .action(async (options) => {
      await validatorsAction.getValidator({ address: options.address });
    });

  validatorsCommand
    .command("delete")
    .description("Delete a specific validator or all validators")
    .option("--address <validatorAddress>", "The address of the validator to delete (omit to delete all validators)")
    .action(async (options) => {
      await validatorsAction.deleteValidator({ address: options.address });
    });

  validatorsCommand
    .command("count")
    .description("Count all validators")
    .action(async () => {
      await validatorsAction.countValidators();
    });

  validatorsCommand
    .command("update <validatorAddress>")
    .description("Update a validator's details")
    .option("--stake <stake>", "New stake for the validator")
    .option("--provider <provider>", "New provider for the validator")
    .option("--model <model>", "New model for the validator")
    .option("--config <config>", "New JSON config for the validator")
    .action(async (validatorAddress, options) => {
      await validatorsAction.updateValidator({
        address: validatorAddress,
        stake: options.stake,
        provider: options.provider,
        model: options.model,
        config: options.config,
      });
    });

  validatorsCommand
    .command("create-random")
    .description("Create random validators")
    .option("--count <count>", "Number of validators to create", "1") // Default to "1"
    .option(
      "--providers <providers...>",
      "Space-separated list of provider names (e.g., openai ollama)",
      []
    )
    .option(
      "--models <models...>",
      "Space-separated list of model names (e.g., gpt-4 gpt-4o)",
      []
    )
    .action(async (options) => {
      await validatorsAction.createRandomValidators({
        count: options.count,
        providers: options.providers,
        models: options.models,
      });
    });

  validatorsCommand
    .command("create")
    .description("Create a new validator")
    .option("--stake <stake>", "Stake amount for the validator (default: 1)", "1")
    .option(
      "--config <config>",
      `Optional JSON configuration for the validator (e.g., '{"max_tokens": 500, "temperature": 0.75}')`
    )
    .option("--provider <provider>", "Specify the provider for the validator")
    .option("--model <model>", "Specify the model for the validator")
    .action(async (options) => {
      await validatorsAction.createValidator({
        stake: options.stake,
        config: options.config,
        provider: options.provider,
        model: options.model,
      });
    });

  return program;
}


