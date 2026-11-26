import inquirer from "inquirer";
import {DistinctQuestion} from "inquirer";
import {ISimulatorService} from "../../lib/interfaces/ISimulatorService";
import {AI_PROVIDERS_CONFIG, AiProviders, localnetCompatibleVersion} from "../../lib/config/simulator";
import {OllamaAction} from "../update/ollama";
import {BaseAction} from "../../lib/actions/BaseAction";
import {SimulatorService} from "../../lib/services/simulator";

export interface InitActionOptions {
  numValidators: number;
  headless: boolean;
  resetDb: boolean;
  localnetVersion?: string;
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

  /**
   * Decide which localnet version `init` runs.
   *
   * An explicit `--localnet-version` is always honoured, so scripted and CI use
   * is unaffected. Otherwise show what is actually published: the flag used to
   * default to a hardcoded floor (`v0.65.0`) with no way to discover anything
   * newer, which is the gap #164 asks to close.
   *
   * The registry lookup is best-effort. Offline, rate-limited, or an empty list
   * falls straight back to `localnetCompatibleVersion`. A force-closed prompt
   * (no TTY and no piped stdin, e.g. CI) falls back the same way rather than
   * aborting `init`, and an explicit flag still short-circuits the prompt.
   */
  private async resolveLocalnetVersion(requested?: string): Promise<string> {
    if (requested) {
      return requested;
    }

    this.startSpinner("Fetching available localnet versions...");
    const versions = await this.simulatorService.listAvailableLocalnetVersions();
    this.stopSpinner();

    if (versions.length === 0) {
      this.logInfo(
        `Could not fetch the published localnet versions, defaulting to ${localnetCompatibleVersion}.`,
      );
      return localnetCompatibleVersion;
    }

    try {
      const answer = await inquirer.prompt([
        {
          type: "list",
          name: "localnetVersion",
          message: "Select the GenLayer localnet version to run:",
          choices: versions,
          default: versions[0],
        },
      ]);
      return answer.localnetVersion as string;
    } catch {
      // inquirer throws ExitPromptError when there is no way to answer the
      // prompt. Default rather than fail: the version picker is an
      // improvement, not a precondition for starting a localnet.
      return localnetCompatibleVersion;
    }
  }

  public async execute(options: InitActionOptions): Promise<void> {
    try {
      this.simulatorService.setComposeOptions(options.headless, options.ollama);
      let localnetVersion = await this.resolveLocalnetVersion(options.localnetVersion);
      if (localnetVersion !== "latest") {
        localnetVersion = this.simulatorService.normalizeLocalnetVersion(localnetVersion);
        
        if (this.simulatorService.compareVersions(localnetVersion, localnetCompatibleVersion) < 0) {
          this.failSpinner(`Localnet version ${localnetVersion} is not supported. Minimum required version is ${localnetCompatibleVersion}. Please use a newer version.`);
          return;
        }
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
        ? `GenLayer Localnet is already running and this command is going to reset GenLayer docker images, containers and volumes, providers API Keys, and GenLayer database (accounts, transactions, validators and logs). Contract code (gpy files) will be kept. Do you want to continue?`
        : `This command is going to reset GenLayer docker images, containers and volumes, providers API Keys, and GenLayer database (accounts, transactions, validators and logs). Contract code (gpy files) will be kept. Do you want to continue?`;

      await this.confirmPrompt(confirmMessage);

      this.logInfo(`Initializing GenLayer CLI with ${options.numValidators} validators`);

      // Reset Docker containers, images, and volumes
      this.startSpinner("Resetting Docker containers, images, and volumes...");
      await this.simulatorService.resetDockerContainers();
      await this.simulatorService.resetDockerImages();
      await this.simulatorService.resetDockerVolumes();
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
      this.simulatorService.setupLocalhostAccess();
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
