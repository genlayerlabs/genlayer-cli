import {describe, test, vi, beforeEach, afterEach, expect} from "vitest";
import inquirer from "inquirer";
import {InitAction, InitActionOptions} from "../../src/commands/general/init";
import {SimulatorService} from "../../src/lib/services/simulator";
import {OllamaAction} from "../../src/commands/update/ollama";

describe("InitAction", () => {
  let initAction: InitAction;
  let inquirerPromptSpy: ReturnType<any>;
  let checkCliVersionSpy: ReturnType<typeof vi.spyOn>;
  let checkInstallRequirementsSpy: ReturnType<typeof vi.spyOn>;
  let checkVersionRequirementsSpy: ReturnType<typeof vi.spyOn>;
  let resetDockerContainersSpy: ReturnType<typeof vi.spyOn>;
  let resetDockerImagesSpy: ReturnType<typeof vi.spyOn>;
  let addConfigToEnvFileSpy: ReturnType<typeof vi.spyOn>;
  let runSimulatorSpy: ReturnType<typeof vi.spyOn>;
  let waitForSimulatorSpy: ReturnType<typeof vi.spyOn>;
  let deleteAllValidatorsSpy: ReturnType<typeof vi.spyOn>;
  let createRandomValidatorsSpy: ReturnType<typeof vi.spyOn>;
  let cleanDatabaseSpy: ReturnType<typeof vi.spyOn>;
  let openFrontendSpy: ReturnType<typeof vi.spyOn>;
  let getFrontendUrlSpy: ReturnType<typeof vi.spyOn>;
  let normalizeLocalnetVersionSpy: ReturnType<typeof vi.spyOn>;

  const defaultConfig = {defaultOllamaModel: "llama3"};

  const defaultOptions: InitActionOptions = {
    numValidators: 5,
    headless: false,
    resetDb: false,
    localnetVersion: "v1.0.0",
    ollama: false
  };

  beforeEach(() => {
    vi.clearAllMocks();
    initAction = new InitAction();
    inquirerPromptSpy = vi.spyOn(inquirer, "prompt");
    vi.spyOn(initAction as any, "startSpinner").mockImplementation(() => {});
    vi.spyOn(initAction as any, "setSpinnerText").mockImplementation(() => {});
    vi.spyOn(initAction as any, "succeedSpinner").mockImplementation(() => {});
    vi.spyOn(initAction as any, "failSpinner").mockImplementation(() => {});
    vi.spyOn(initAction as any, "stopSpinner").mockImplementation(() => {});
    vi.spyOn(initAction as any, "logError").mockImplementation(() => {});
    vi.spyOn(initAction, "getConfig").mockReturnValue(defaultConfig);
    checkCliVersionSpy = vi.spyOn(SimulatorService.prototype, "checkCliVersion").mockResolvedValue(undefined);
    checkInstallRequirementsSpy = vi
      .spyOn(SimulatorService.prototype, "checkInstallRequirements")
      .mockResolvedValue({git: true, docker: true});
    checkVersionRequirementsSpy = vi
      .spyOn(SimulatorService.prototype, "checkVersionRequirements")
      .mockResolvedValue({node: "", docker: ""});
    resetDockerContainersSpy = vi
      .spyOn(SimulatorService.prototype, "resetDockerContainers")
      .mockResolvedValue(undefined);
    resetDockerImagesSpy = vi
      .spyOn(SimulatorService.prototype, "resetDockerImages")
      .mockResolvedValue(undefined);
    addConfigToEnvFileSpy = vi.spyOn(SimulatorService.prototype, "addConfigToEnvFile").mockResolvedValue();
    runSimulatorSpy = vi
      .spyOn(SimulatorService.prototype, "runSimulator")
      .mockResolvedValue(undefined as any);
    waitForSimulatorSpy = vi
      .spyOn(SimulatorService.prototype, "waitForSimulatorToBeReady")
      .mockResolvedValue({initialized: true}) as any;
    deleteAllValidatorsSpy = vi
      .spyOn(SimulatorService.prototype, "deleteAllValidators")
      .mockResolvedValue(undefined);
    createRandomValidatorsSpy = vi
      .spyOn(SimulatorService.prototype, "createRandomValidators")
      .mockResolvedValue(undefined) as any;
    cleanDatabaseSpy = vi.spyOn(SimulatorService.prototype, "cleanDatabase").mockResolvedValue(true);
    openFrontendSpy = vi.spyOn(SimulatorService.prototype, "openFrontend").mockResolvedValue(true);
    getFrontendUrlSpy = vi
      .spyOn(SimulatorService.prototype, "getFrontendUrl")
      .mockReturnValue("http://localhost:8080");
    normalizeLocalnetVersionSpy = vi
      .spyOn(SimulatorService.prototype, "normalizeLocalnetVersion")
      .mockImplementation((v: string) => v) as any;
    vi.spyOn(SimulatorService.prototype, "isLocalnetRunning").mockResolvedValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Successful Execution", () => {
    test("should show combined confirmation message when localnet is running", async () => {
      vi.spyOn(SimulatorService.prototype, "isLocalnetRunning").mockResolvedValue(true);

      const confirmPromptSpy = vi.spyOn(initAction as any, "confirmPrompt").mockResolvedValue(undefined);

      inquirerPromptSpy
        .mockResolvedValueOnce({selectedLlmProviders: ["openai"]})
        .mockResolvedValueOnce({openai: "API_KEY_OPENAI"});

      await initAction.execute(defaultOptions);

      expect(confirmPromptSpy).toHaveBeenCalledWith(
        "GenLayer Localnet is already running and this command is going to reset GenLayer docker images and containers, providers API Keys, and GenLayer database (accounts, transactions, validators and logs). Contract code (gpy files) will be kept. Do you want to continue?",
      );
    });

    test("should show standard confirmation message when localnet is not running", async () => {
      vi.spyOn(SimulatorService.prototype, "isLocalnetRunning").mockResolvedValue(false);

      const confirmPromptSpy = vi.spyOn(initAction as any, "confirmPrompt").mockResolvedValue(undefined);

      inquirerPromptSpy
        .mockResolvedValueOnce({selectedLlmProviders: ["openai"]})
        .mockResolvedValueOnce({openai: "API_KEY_OPENAI"});

      await initAction.execute(defaultOptions);

      expect(confirmPromptSpy).toHaveBeenCalledWith(
        "This command is going to reset GenLayer docker images and containers, providers API Keys, and GenLayer database (accounts, transactions, validators and logs). Contract code (gpy files) will be kept. Do you want to continue?",
      );
    });

    test("executes the full flow in non-headless mode", async () => {
      inquirerPromptSpy
        .mockResolvedValueOnce({confirmAction: true})
        .mockResolvedValueOnce({selectedLlmProviders: ["openai", "heuristai"]})
        .mockResolvedValueOnce({openai: "API_KEY_OPENAI"})
        .mockResolvedValueOnce({heuristai: "API_KEY_HEURIST"});
      await initAction.execute(defaultOptions);
      expect(checkCliVersionSpy).toHaveBeenCalled();
      expect(checkInstallRequirementsSpy).toHaveBeenCalled();
      expect(checkVersionRequirementsSpy).toHaveBeenCalled();
      expect(resetDockerContainersSpy).toHaveBeenCalled();
      expect(resetDockerImagesSpy).toHaveBeenCalled();
      expect(addConfigToEnvFileSpy).toHaveBeenCalledWith({
        OPENAIKEY: "API_KEY_OPENAI",
        HEURISTAIAPIKEY: "API_KEY_HEURIST",
      });
      expect(addConfigToEnvFileSpy).toHaveBeenCalledWith({LOCALNETVERSION: "v1.0.0"});
      expect(runSimulatorSpy).toHaveBeenCalled();
      expect(waitForSimulatorSpy).toHaveBeenCalled();
      expect(deleteAllValidatorsSpy).toHaveBeenCalled();
      expect(createRandomValidatorsSpy).toHaveBeenCalledWith(5, ["openai", "heuristai"]);
      expect(getFrontendUrlSpy).toHaveBeenCalled();
      expect(openFrontendSpy).toHaveBeenCalled();
      expect((initAction as any).succeedSpinner).toHaveBeenCalledWith(
        "GenLayer Localnet initialized successfully! Go to http://localhost:8080 in your browser to access it.",
      );
    });

    test("executes correctly in headless mode with DB reset and 'ollama' selected", async () => {
      inquirerPromptSpy
        .mockResolvedValueOnce({confirmAction: true})
        .mockResolvedValueOnce({selectedLlmProviders: ["openai", "ollama"]})
        .mockResolvedValueOnce({openai: "API_KEY_OPENAI"});
      const ollamaUpdateSpy = vi.spyOn(OllamaAction.prototype, "updateModel").mockResolvedValue(undefined);
      const headlessOptions: InitActionOptions = {
        numValidators: 5,
        headless: true,
        resetDb: true,
        localnetVersion: "v1.0.0",
        ollama: true
      };
      await initAction.execute(headlessOptions);
      expect(cleanDatabaseSpy).toHaveBeenCalled();
      expect(openFrontendSpy).not.toHaveBeenCalled();
      expect((initAction as any).succeedSpinner).toHaveBeenCalledWith(
        "GenLayer Localnet initialized successfully! ",
      );
      expect(ollamaUpdateSpy).toHaveBeenCalledWith("llama3");
    });

    test("normalizes localnetVersion if not 'latest'", async () => {
      const customVersion = "custom-v1";
      normalizeLocalnetVersionSpy.mockReturnValue(customVersion);
      inquirerPromptSpy
        .mockResolvedValueOnce({confirmAction: true})
        .mockResolvedValueOnce({selectedLlmProviders: ["openai"]})
        .mockResolvedValueOnce({openai: "API_KEY_OPENAI"});
      await initAction.execute({...defaultOptions, localnetVersion: customVersion});
      expect(normalizeLocalnetVersionSpy).toHaveBeenCalledWith(customVersion);
      expect(addConfigToEnvFileSpy).toHaveBeenCalledWith({LOCALNETVERSION: customVersion});
    });

    test("should set defaultOllamaModel to 'llama3' if not provided in config", async () => {
      vi.spyOn(initAction, "getConfig").mockReturnValue({});
      const writeConfigSpy = vi.spyOn(initAction, "writeConfig").mockImplementation(() => {});
      const ollamaUpdateSpy = vi.spyOn(OllamaAction.prototype, "updateModel").mockResolvedValue(undefined);
      inquirerPromptSpy
        .mockResolvedValueOnce({confirmAction: true})
        .mockResolvedValueOnce({selectedLlmProviders: ["ollama"]})
        .mockResolvedValueOnce({ollama: "API_KEY_OLLAMA"});
      await initAction.execute(defaultOptions);
      expect(writeConfigSpy).toHaveBeenCalledWith("defaultOllamaModel", "llama3");
      expect(ollamaUpdateSpy).toHaveBeenCalledWith("llama3");
    });

    test("validates API key input for configurable provider", async () => {
      inquirerPromptSpy.mockResolvedValueOnce({confirmAction: true});
      inquirerPromptSpy.mockResolvedValueOnce({selectedLlmProviders: ["openai"]});
      let capturedQuestion: any;
      inquirerPromptSpy.mockImplementationOnce((questions: any) => {
        capturedQuestion = questions[0];
        return Promise.resolve({openai: "dummy-key"});
      });
      await initAction.execute(defaultOptions);
      expect(capturedQuestion).toBeDefined();
      const expectedError = `Please enter a valid API Key for OpenAI.`;
      expect(capturedQuestion.validate("")).toBe(expectedError);
      expect(capturedQuestion.validate("non-empty-key")).toBe(true);
    });

    test("validates LLM provider selection prompt", async () => {
      let capturedQuestion: any;
      inquirerPromptSpy
        .mockResolvedValueOnce({confirmAction: true})
        .mockImplementationOnce((questions: any) => {
          capturedQuestion = questions[0];
          return Promise.resolve({selectedLlmProviders: ["openai"]});
        })
        .mockResolvedValueOnce({openai: "API_KEY_OPENAI"});
      await initAction.execute(defaultOptions);
      expect(capturedQuestion.validate([])).toBe("You must choose at least one option.");
      expect(capturedQuestion.validate(["openai"])).toBe(true);
    });

    test("should exclude ollama from choices when ollama option is false", async () => {
      const getAiProvidersOptionsSpy = vi.spyOn(SimulatorService.prototype, "getAiProvidersOptions");
      inquirerPromptSpy
        .mockResolvedValueOnce({ confirmAction: true })
        .mockResolvedValueOnce({ selectedLlmProviders: ["openai"] })
        .mockResolvedValueOnce({ openai: "API_KEY_OPENAI" });
      
      await initAction.execute({ ...defaultOptions, ollama: false });
      
      expect(getAiProvidersOptionsSpy).toHaveBeenCalledWith(true, ["ollama"]);
    });

    test("should include ollama in choices when ollama option is true", async () => {
      const getAiProvidersOptionsSpy = vi.spyOn(SimulatorService.prototype, "getAiProvidersOptions");
      inquirerPromptSpy
        .mockResolvedValueOnce({ confirmAction: true })
        .mockResolvedValueOnce({ selectedLlmProviders: ["openai"] })
        .mockResolvedValueOnce({ openai: "API_KEY_OPENAI" });
      
      await initAction.execute({ ...defaultOptions, ollama: true });
      
      expect(getAiProvidersOptionsSpy).toHaveBeenCalledWith(true, []);
    });
  });

  describe("Error Handling", () => {
    test("fails if Docker is not installed", async () => {
      checkInstallRequirementsSpy.mockResolvedValue({git: true, docker: false});
      await initAction.execute(defaultOptions);
      expect((initAction as any).failSpinner).toHaveBeenCalledWith(
        "Docker is not installed. Please install Docker and try again.\n",
      );
    });

    test("fails if checkInstallRequirements throws an error", async () => {
      const error = new Error("Install error");
      checkInstallRequirementsSpy.mockRejectedValue(error);
      await initAction.execute(defaultOptions);
      expect((initAction as any).failSpinner).toHaveBeenCalledWith(
        "An error occurred during initialization.",
        error,
      );
    });

    test("fails if version requirements are not met (both docker and node)", async () => {
      const version = "99.9.9";
      checkVersionRequirementsSpy.mockResolvedValue({docker: version, node: version});
      await initAction.execute(defaultOptions);
      expect((initAction as any).failSpinner).toHaveBeenCalledWith(
        `Docker version ${version} or higher is required. Please update Docker and try again.\nNode version ${version} or higher is required. Please update Node and try again.\n`,
      );
    });

    test("fails if version requirement for docker is not met", async () => {
      const version = "99.9.9";
      checkVersionRequirementsSpy.mockResolvedValue({docker: version});
      await initAction.execute(defaultOptions);
      expect((initAction as any).failSpinner).toHaveBeenCalledWith(
        `Docker version ${version} or higher is required. Please update Docker and try again.\n`,
      );
    });

    test("fails if version requirement for node is not met", async () => {
      const version = "99.9.9";
      checkVersionRequirementsSpy.mockResolvedValue({node: version});
      await initAction.execute(defaultOptions);
      expect((initAction as any).failSpinner).toHaveBeenCalledWith(
        `Node version ${version} or higher is required. Please update Node and try again.\n`,
      );
    });

    test("aborts if user does not confirm reset action", async () => {
      inquirerPromptSpy.mockResolvedValueOnce({confirmAction: false});
      await initAction.execute(defaultOptions);
      expect((initAction as any).logError).toHaveBeenCalledWith(`Operation aborted!`);
    });

    test("fails if resetDockerContainers throws an error", async () => {
      inquirerPromptSpy.mockResolvedValueOnce({confirmAction: true});
      resetDockerContainersSpy.mockRejectedValue(new Error("Container reset error"));
      await initAction.execute(defaultOptions);
      expect((initAction as any).failSpinner).toHaveBeenCalledWith(
        "An error occurred during initialization.",
        new Error("Container reset error"),
      );
    });

    test("fails if runSimulator throws an error", async () => {
      inquirerPromptSpy
        .mockResolvedValueOnce({confirmAction: true})
        .mockResolvedValueOnce({selectedLlmProviders: ["openai"]})
        .mockResolvedValueOnce({openai: "API_KEY_OPENAI"});
      runSimulatorSpy.mockRejectedValue(new Error("Run simulator error"));
      await initAction.execute(defaultOptions);
      expect((initAction as any).failSpinner).toHaveBeenCalledWith(
        "An error occurred during initialization.",
        new Error("Run simulator error"),
      );
    });

    test("fails if waitForSimulatorToBeReady returns ERROR code", async () => {
      inquirerPromptSpy
        .mockResolvedValueOnce({confirmAction: true})
        .mockResolvedValueOnce({selectedLlmProviders: ["openai"]})
        .mockResolvedValueOnce({openai: "API_KEY_OPENAI"});
      waitForSimulatorSpy.mockResolvedValue({
        initialized: false,
        errorCode: "ERROR",
        errorMessage: "Initialization failed",
      });
      await initAction.execute(defaultOptions);
      expect((initAction as any).failSpinner).toHaveBeenCalledWith(
        "Unable to initialize the GenLayer Localnet: Initialization failed",
      );
    });

    test("fails if waitForSimulatorToBeReady returns TIMEOUT code", async () => {
      inquirerPromptSpy
        .mockResolvedValueOnce({confirmAction: true})
        .mockResolvedValueOnce({selectedLlmProviders: ["openai"]})
        .mockResolvedValueOnce({openai: "API_KEY_OPENAI"});
      waitForSimulatorSpy.mockResolvedValue({
        initialized: false,
        errorCode: "TIMEOUT",
        errorMessage: "Timeout",
      });
      await initAction.execute(defaultOptions);
      expect((initAction as any).failSpinner).toHaveBeenCalledWith(
        "The localnet is taking too long to initialize. Please try again after the localnet is ready.",
      );
    });

    test("fails if deleteAllValidators throws an error", async () => {
      inquirerPromptSpy
        .mockResolvedValueOnce({confirmAction: true})
        .mockResolvedValueOnce({selectedLlmProviders: ["openai"]})
        .mockResolvedValueOnce({openai: "API_KEY_OPENAI"});
      deleteAllValidatorsSpy.mockRejectedValue(new Error("Validator deletion error"));
      await initAction.execute(defaultOptions);
      expect((initAction as any).failSpinner).toHaveBeenCalledWith(
        "An error occurred during initialization.",
        expect.any(Error),
      );
    });

    test("fails if createRandomValidators throws an error", async () => {
      inquirerPromptSpy
        .mockResolvedValueOnce({confirmAction: true})
        .mockResolvedValueOnce({selectedLlmProviders: ["openai"]})
        .mockResolvedValueOnce({openai: "API_KEY_OPENAI"});
      createRandomValidatorsSpy.mockRejectedValue(new Error("Validator creation error"));
      await initAction.execute(defaultOptions);
      expect((initAction as any).failSpinner).toHaveBeenCalledWith(
        "An error occurred during initialization.",
        Error("Validator creation error"),
      );
    });

    test("fails if cleanDatabase throws an error when resetDb is true", async () => {
      inquirerPromptSpy
        .mockResolvedValueOnce({confirmAction: true})
        .mockResolvedValueOnce({selectedLlmProviders: ["openai"]})
        .mockResolvedValueOnce({openai: "API_KEY_OPENAI"});
      cleanDatabaseSpy.mockRejectedValue(new Error("Database error"));
      const optionsWithResetDb: InitActionOptions = {...defaultOptions, resetDb: true};
      await initAction.execute(optionsWithResetDb);
      expect((initAction as any).failSpinner).toHaveBeenCalledWith(
        "An error occurred during initialization.",
        new Error("Database error"),
      );
    });

    test("fails if openFrontend throws an error", async () => {
      inquirerPromptSpy
        .mockResolvedValueOnce({confirmAction: true})
        .mockResolvedValueOnce({selectedLlmProviders: ["openai"]})
        .mockResolvedValueOnce({openai: "API_KEY_OPENAI"});
      openFrontendSpy.mockRejectedValue(new Error("Frontend error"));
      await initAction.execute(defaultOptions);
      expect((initAction as any).failSpinner).toHaveBeenCalledWith(
        "An error occurred during initialization.",
        new Error("Frontend error"),
      );
    });

    test("catches and logs unexpected errors", async () => {
      inquirerPromptSpy.mockRejectedValueOnce(new Error("Unexpected prompt error"));
      await initAction.execute(defaultOptions);
      expect((initAction as any).failSpinner).toHaveBeenCalledWith(
        "An error occurred during initialization.",
        new Error("Unexpected prompt error"),
      );
    });
  });
});
