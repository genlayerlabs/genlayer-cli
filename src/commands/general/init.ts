import inquirer from "inquirer";
import {DistinctQuestion} from "inquirer";
import {ISimulatorService} from "../../lib/interfaces/ISimulatorService";
import {AI_PROVIDERS_CONFIG, AiProviders} from "../../lib/config/simulator";
import {OllamaAction} from "../update/ollama";
import {BaseAction} from "../../lib/actions/BaseAction";
import {SimulatorService} from "../../lib/services/simulator";

export interface InitActionOptions {
  numValidators: number;
  headless: boolean;
  resetDb: boolean;
  localnetVersion: string;
  ollama: boolean;
}

function getRequirementsErrorMessage({docker}: Record<string, boolean>): string {
  if (!docker) {
    return "Docker is not installed. Please install Docker and try again.\n";
  }
  return "";
}

function getVersionErrorMessage({docker, node}: Record<string, string>): string {
  let message = "";

  if (docker) {
    message += `Docker version ${docker} or higher is required. Please update Docker and try again.\n`;
  }
  if (node) {
    message += `Node version ${node} or higher is required. Please update Node and try again.\n`;
  }
  return message;
}

export class InitAction extends BaseAction {
  private simulatorService: ISimulatorService;
  constructor() {
    super();
    this.simulatorService = new SimulatorService();
  }

  public async execute(options: InitActionOptions): Promise<void> {
    try {
      this.simulatorService.setComposeOptions(options.headless, options.ollama);
      let localnetVersion = options.localnetVersion;
      if (localnetVersion !== "latest") {
        localnetVersion = this.simulatorService.normalizeLocalnetVersion(localnetVersion);
      }

      this.startSpinner("Checking CLI version...");
      await this.simulatorService.checkCliVersion();

      const isRunning = await this.simulatorService.isLocalnetRunning();

      this.setSpinnerText("Checking installation requirements...");
      const requirementsInstalled = await this.simulatorService.checkInstallRequirements();
      const requirementErrorMessage = getRequirementsErrorMessage(requirementsInstalled);
      if (requirementErrorMessage) {
        this.failSpinner(requirementErrorMessage);
        return;
      }

      this.setSpinnerText("Checking version requirements...");
      const missingVersions = await this.simulatorService.checkVersionRequirements();
      const versionErrorMessage = getVersionErrorMessage(missingVersions);
      if (versionErrorMessage) {
        this.failSpinner(versionErrorMessage);
        return;
      }
      this.stopSpinner();

      const confirmMessage = isRunning
        ? `GenLayer Localnet is already running and this command is going to reset GenLayer docker images and containers, providers API Keys, and GenLayer database (accounts, transactions, validators and logs). Contract code (gpy files) will be kept. Do you want to continue?`
        : `This command is going to reset GenLayer docker images and containers, providers API Keys, and GenLayer database (accounts, transactions, validators and logs). Contract code (gpy files) will be kept. Do you want to continue?`;

      await this.confirmPrompt(confirmMessage);

      this.logInfo(`Initializing GenLayer CLI with ${options.numValidators} validators`);

      // Reset Docker containers and images
      this.startSpinner("Resetting Docker containers and images...");
      await this.simulatorService.resetDockerContainers();
      await this.simulatorService.resetDockerImages();
      this.stopSpinner();

      const llmQuestions: DistinctQuestion[] = [
        {
          type: "checkbox",
          name: "selectedLlmProviders",
          message: "Select which LLM providers do you want to use:",
          choices: this.simulatorService.getAiProvidersOptions(true, options.ollama ? [] : ["ollama"]),
          validate: answer => (answer.length < 1 ? "You must choose at least one option." : true),
        },
      ];
      const llmProvidersAnswer = await inquirer.prompt(llmQuestions);
      const selectedLlmProviders = llmProvidersAnswer.selectedLlmProviders as AiProviders[];

      let defaultOllamaModel = this.getConfig().defaultOllamaModel;
      const aiProvidersEnvVars: Record<string, string> = {};
      const configurableAiProviders = selectedLlmProviders.filter(
        (provider: AiProviders) => AI_PROVIDERS_CONFIG[provider].envVar,
      );
      for (const provider of configurableAiProviders) {
        const providerConfig = AI_PROVIDERS_CONFIG[provider];
        const keyQuestion: DistinctQuestion[] = [
          {
            type: "input",
            name: providerConfig.cliOptionValue,
            message: `Please enter your ${providerConfig.name} API Key:`,
            validate: (value: string) =>
              value.length ? true : `Please enter a valid API Key for ${providerConfig.name}.`,
          },
        ];
        const apiKeyAnswer = await inquirer.prompt(keyQuestion);
        aiProvidersEnvVars[providerConfig.envVar!] = apiKeyAnswer[providerConfig.cliOptionValue];
      }

      this.startSpinner("Configuring GenLayer Localnet environment...");
      this.simulatorService.addConfigToEnvFile(aiProvidersEnvVars);
      this.simulatorService.addConfigToEnvFile({LOCALNETVERSION: localnetVersion});

      this.setSpinnerText("Running GenLayer Localnet...");
      await this.simulatorService.runSimulator();

      this.setSpinnerText("Waiting for localnet to be ready...");
      const {initialized, errorCode, errorMessage} = await this.simulatorService.waitForSimulatorToBeReady();
      if (!initialized) {
        if (errorCode === "ERROR") {
          this.failSpinner(`Unable to initialize the GenLayer Localnet: ${errorMessage}`);
          return;
        }
        if (errorCode === "TIMEOUT") {
          this.failSpinner(
            "The localnet is taking too long to initialize. Please try again after the localnet is ready.",
          );
          return;
        }
      }

      this.stopSpinner();

      if (selectedLlmProviders.includes("ollama")) {
        const ollamaAction = new OllamaAction();
        if (!defaultOllamaModel) {
          this.writeConfig("defaultOllamaModel", "llama3");
          defaultOllamaModel = "llama3";
        }
        await ollamaAction.updateModel(defaultOllamaModel);
      }

      this.startSpinner("Initializing validators...");
      await this.simulatorService.deleteAllValidators();
      await this.simulatorService.createRandomValidators(Number(options.numValidators), selectedLlmProviders);

      if (options.resetDb) {
        this.setSpinnerText("Cleaning database...");
        await this.simulatorService.cleanDatabase();
      }

      let successMessage = "GenLayer Localnet initialized successfully! ";
      if (!options.headless) {
        successMessage += `Go to ${this.simulatorService.getFrontendUrl()} in your browser to access it.`;
      }
      if (!options.headless) {
        await this.simulatorService.openFrontend();
      }
      this.succeedSpinner(successMessage);
    } catch (error) {
      this.failSpinner("An error occurred during initialization.", error);
    }
  }
}
