import inquirer from "inquirer";
import {ISimulatorService} from "../../lib/interfaces/ISimulatorService";
import {DistinctQuestion} from "inquirer";
import {BaseAction} from "../../lib/actions/BaseAction";
import {SimulatorService} from "../../lib/services/simulator";

export interface StartActionOptions {
  resetValidators: boolean;
  numValidators: number;
  headless: boolean;
  resetDb: boolean;
  ollama: boolean;
}

export class StartAction extends BaseAction {
  private simulatorService: ISimulatorService;

  constructor() {
    super();
    this.simulatorService = new SimulatorService();
  }

  async execute(options: StartActionOptions) {
    const {resetValidators, numValidators, headless, resetDb, ollama} = options;

    this.simulatorService.setComposeOptions(headless, ollama);
    this.startSpinner("Checking CLI version...");
    await this.simulatorService.checkCliVersion();

    const isRunning = await this.simulatorService.isLocalnetRunning();
    if (isRunning) {
      this.stopSpinner();
      await this.confirmPrompt("GenLayer Localnet is already running. Do you want to proceed?");
      this.startSpinner("Stopping Docker containers...");
      await this.simulatorService.stopDockerContainers();
    }

    const restartValidatorsHintText = resetValidators
      ? `creating new ${numValidators} random validators`
      : "keeping the existing validators";
    this.setSpinnerText(`Starting GenLayer Localnet (${restartValidatorsHintText})...`);

    try {
      await this.simulatorService.runSimulator();
    } catch (error) {
      this.failSpinner("Error starting the simulator", error);
      return;
    }

    try {
      this.setSpinnerText("Waiting for the simulator to be ready...");
      const {initialized, errorCode, errorMessage} = await this.simulatorService.waitForSimulatorToBeReady();

      if (!initialized) {
        if (errorCode === "ERROR") {
          this.failSpinner("Unable to initialize the GenLayer simulator.", errorMessage);
          return;
        }
        if (errorCode === "TIMEOUT") {
          this.failSpinner("The simulator is taking too long to initialize. Please try again later.");
          return;
        }
      }
    } catch (error) {
      this.failSpinner("Error waiting for the simulator to be ready", error);
      return;
    }

    if (resetDb) {
      this.setSpinnerText("Resetting database...");
      await this.simulatorService.cleanDatabase();
    }

    if (resetValidators) {
      this.setSpinnerText("Initializing validators...");
      try {
        await this.simulatorService.deleteAllValidators();

        const questions: DistinctQuestion[] = [
          {
            type: "checkbox",
            name: "selectedLlmProviders",
            message: "Select which LLM providers do you want to use:",
            choices: this.simulatorService.getAiProvidersOptions(false, ollama ? [] : ["ollama"]),
            validate: answer => (answer.length < 1 ? "You must choose at least one option." : true),
          },
        ];

        const llmProvidersAnswer = await inquirer.prompt(questions);
        await this.simulatorService.createRandomValidators(
          numValidators,
          llmProvidersAnswer.selectedLlmProviders,
        );
      } catch (error) {
        this.failSpinner("Unable to initialize the validators", error);
        return;
      }
    }

    let successMessage = "GenLayer simulator initialized successfully! ";
    successMessage += headless
      ? ""
      : `Go to ${this.simulatorService.getFrontendUrl()} in your browser to access it.`;
    this.succeedSpinner(successMessage);

    if (!headless) {
      try {
        this.startSpinner("Opening frontend...");
        await this.simulatorService.openFrontend();
        this.succeedSpinner("Frontend opened successfully");
      } catch (error) {
        this.failSpinner("Error opening the frontend", error);
      }
    }
  }
}
