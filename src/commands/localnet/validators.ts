import inquirer from "inquirer";
import { rpcClient } from "../../lib/clients/jsonRpcClient";
import { BaseAction } from "../../lib/actions/BaseAction";

export interface ValidatorOptions {
  address?: string;
}

export interface UpdateValidatorOptions {
  address: string;
  stake?: string;
  provider?: string;
  model?: string;
  config?: string;
}

export interface CreateRandomValidatorsOptions {
  count: string;
  providers: string[];
  models: string[];
}

export interface CreateValidatorOptions {
  stake: string;
  config?: string;
  model?: string;
  provider?: string;
}

export class ValidatorsAction extends BaseAction {
  public async getValidator(options: ValidatorOptions): Promise<void> {
    try {
      if (options.address) {
        this.startSpinner(`Fetching validator with address: ${options.address}`);

        const result = await rpcClient.request({
          method: "sim_getValidator",
          params: [options.address],
        });

        this.succeedSpinner(`Successfully fetched validator with address: ${options.address}`, result.result);
      } else {
        this.startSpinner(`Fetching all validators...`);

        const result = await rpcClient.request({
          method: "sim_getAllValidators",
          params: [],
        });
        this.succeedSpinner('Successfully fetched all validators.', result.result)
      }
    } catch (error) {
      this.failSpinner("Error fetching validators", error);
    }
  }

  public async deleteValidator(options: ValidatorOptions): Promise<void> {
    try {
      if (options.address) {
        await this.confirmPrompt(`This command will delete the validator with the address: ${options.address}. Do you want to continue?`);
        this.startSpinner(`Deleting validator with address: ${options.address}`);

        const result = await rpcClient.request({
          method: "sim_deleteValidator",
          params: [options.address],
        });

        this.succeedSpinner(`Deleted Address: ${result.result}`);
      } else {
        await this.confirmPrompt(`This command will delete all validators. Do you want to continue?`);
        this.startSpinner("Deleting all validators...");

        await rpcClient.request({
          method: "sim_deleteAllValidators",
          params: [],
        });

        this.succeedSpinner("Successfully deleted all validators");
      }
    } catch (error) {
      this.failSpinner("Error deleting validators", error);
    }
  }

  public async countValidators(): Promise<void> {
    try {
      this.startSpinner("Counting all validators...");

      const result = await rpcClient.request({
        method: "sim_countValidators",
        params: [],
      });
      this.succeedSpinner(`Total Validators: ${result.result}`);
    } catch (error) {
      this.failSpinner("Error counting validators", error);
    }
  }

  public async updateValidator(options: UpdateValidatorOptions): Promise<void> {
    try {
      this.startSpinner(`Fetching validator with address: ${options.address}...`);
      const currentValidator = await rpcClient.request({
        method: "sim_getValidator",
        params: [options.address],
      });

      this.log("Current Validator Details:", currentValidator.result);

      const parsedStake = options.stake
        ? parseInt(options.stake, 10)
        : currentValidator.result.stake;

      if (isNaN(parsedStake) || parsedStake < 0) {
        return this.failSpinner("Invalid stake value. Stake must be a positive integer.");
      }

      const updatedValidator = {
        address: options.address,
        stake: options.stake || currentValidator.result.stake,
        provider: options.provider || currentValidator.result.provider,
        model: options.model || currentValidator.result.model,
        config: options.config ? JSON.parse(options.config) : currentValidator.result.config,
      };

      this.log("Updated Validator Details:", updatedValidator);

      this.setSpinnerText('Updating Validator...');

      const result = await rpcClient.request({
        method: "sim_updateValidator",
        params: [
          updatedValidator.address,
          updatedValidator.stake,
          updatedValidator.provider,
          updatedValidator.model,
          updatedValidator.config,
        ],
      });

      this.succeedSpinner("Validator successfully updated", result.result);
    } catch (error) {
      this.failSpinner("Error updating validator", error);
    }
  }

  public async createRandomValidators(options: CreateRandomValidatorsOptions): Promise<void> {
    try {
      const count = parseInt(options.count, 10);
      if (isNaN(count) || count < 1) {
        return this.logError("Invalid count. Please provide a positive integer.");
      }

      this.startSpinner(`Creating ${count} random validator(s)...`);
      this.log(`Providers: ${options.providers.length > 0 ? options.providers.join(", ") : "All"}`);
      this.log(`Models: ${options.models.length > 0 ? options.models.join(", ") : "All"}`);

      const result = await rpcClient.request({
        method: "sim_createRandomValidators",
        params: [count, 1, 10, options.providers, options.models],
      });

      this.succeedSpinner("Random validators successfully created", result.result);
    } catch (error) {
      this.failSpinner("Error creating random validators", error);
    }
  }

  public async createValidator(options: CreateValidatorOptions): Promise<void> {
    try {
      const stake = parseInt(options.stake, 10);
      if (isNaN(stake) || stake < 1) {
        return this.logError("Invalid stake. Please provide a positive integer.");
      }

      if (options.model && !options.provider) {
        return this.logError("You must specify a provider if using a model.");
      }

      this.startSpinner("Fetching available providers and models...");

      const providersAndModels = await rpcClient.request({
        method: "sim_getProvidersAndModels",
        params: [],
      });
      this.stopSpinner();

      if (!providersAndModels.result || providersAndModels.result.length === 0) {
        return this.logError("No providers or models available.");
      }

      const availableProviders = [
        ...new Map(
          providersAndModels.result
            .filter((entry: any) => entry.is_available)
            .map((entry: any) => [entry.provider, entry])
        ).values(),
      ];

      let provider =  options.provider

      if(!provider){
        const { selectedProvider } = await inquirer.prompt([
          {
            type: "list",
            name: "selectedProvider",
            message: "Select a provider:",
            choices: availableProviders.map((entry: any) => entry.provider),
          },
        ]);

        provider = selectedProvider;
      }

      const availableModels = providersAndModels.result.filter(
        (entry: any) => entry.provider === provider && entry.is_model_available
      );

      if (availableModels.length === 0) {
        return this.logError("No models available for the selected provider.");
      }

      let model = options.model;

      if(!model){
        const { selectedModel } = await inquirer.prompt([
          {
            type: "list",
            name: "selectedModel",
            message: "Select a model:",
            choices: availableModels.map((entry: any) => entry.model),
          },
        ]);

        model = selectedModel;
      }

      const modelDetails = availableModels.find(
        (entry: any) => entry.model === model
      );

      if (!modelDetails) {
        return this.logError("Selected model details not found.");
      }

      const config = options.config ? JSON.parse(options.config) : modelDetails.config;
      const params = [
        stake,
        modelDetails.provider,
        modelDetails.model,
        config,
        modelDetails.plugin,
        modelDetails.plugin_config,
      ]

      this.log("Validator details:", params);
      this.startSpinner('Creating validator...');

      const result = await rpcClient.request({
        method: "sim_createValidator",
        params,
      });

      this.succeedSpinner("Validator successfully created:", result.result);
    } catch (error) {
      this.failSpinner("Error creating validator", error);
    }
  }
}


