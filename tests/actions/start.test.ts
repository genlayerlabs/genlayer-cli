import {describe, beforeEach, afterEach, test, expect, vi, Mock} from "vitest";
import inquirer from "inquirer";
import {StartAction, StartActionOptions} from "../../src/commands/general/start";
import {SimulatorService} from "../../src/lib/services/simulator";

vi.mock("../../src/lib/services/simulator");
vi.mock("inquirer");

describe("StartAction", () => {
  let startAction: StartAction;
  let mockSimulatorService: SimulatorService;
  let mockConfirmPrompt: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSimulatorService = new SimulatorService();
    startAction = new StartAction();
    startAction["simulatorService"] = mockSimulatorService;

    mockSimulatorService.waitForSimulatorToBeReady = vi.fn().mockResolvedValue({initialized: true});
    mockSimulatorService.stopDockerContainers = vi.fn().mockResolvedValue(undefined);
    mockSimulatorService.getAiProvidersOptions = vi.fn().mockResolvedValue(undefined);

    mockConfirmPrompt = vi.spyOn(startAction as any, "confirmPrompt").mockResolvedValue(undefined);
    vi.spyOn(startAction as any, "startSpinner").mockImplementation(() => {});
    vi.spyOn(startAction as any, "setSpinnerText").mockImplementation(() => {});
    vi.spyOn(startAction as any, "succeedSpinner").mockImplementation(() => {});
    vi.spyOn(startAction as any, "failSpinner").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const defaultOptions: StartActionOptions = {
    resetValidators: false,
    numValidators: 5,
    headless: false,
    resetDb: false,
    ollama: false
  };

  test("should check if localnet is running and proceed without confirmation when not running", async () => {
    mockSimulatorService.isLocalnetRunning = vi.fn().mockResolvedValue(false);

    await startAction.execute(defaultOptions);

    expect(mockSimulatorService.isLocalnetRunning).toHaveBeenCalled();
    expect(mockConfirmPrompt).not.toHaveBeenCalled();
    expect(mockSimulatorService.runSimulator).toHaveBeenCalled();
  });

  test("should prompt for confirmation when localnet is already running", async () => {
    mockSimulatorService.isLocalnetRunning = vi.fn().mockResolvedValue(true);

    await startAction.execute(defaultOptions);

    expect(mockSimulatorService.isLocalnetRunning).toHaveBeenCalled();
    expect(mockConfirmPrompt).toHaveBeenCalledWith(
      "GenLayer Localnet is already running. Do you want to proceed?",
    );
    expect(mockSimulatorService.runSimulator).toHaveBeenCalled();
  });

  test("should start the simulator successfully", async () => {
    mockSimulatorService.checkCliVersion = vi.fn().mockResolvedValue(undefined);
    mockSimulatorService.runSimulator = vi.fn().mockResolvedValue(undefined);
    mockSimulatorService.getFrontendUrl = vi.fn().mockReturnValue("http://localhost:8080");

    await startAction.execute(defaultOptions);

    expect(startAction["startSpinner"]).toHaveBeenCalledWith("Checking CLI version...");
    expect(mockSimulatorService.checkCliVersion).toHaveBeenCalled();

    expect(startAction["setSpinnerText"]).toHaveBeenCalledWith(
      "Starting GenLayer Localnet (keeping the existing validators)...",
    );
    expect(mockSimulatorService.runSimulator).toHaveBeenCalled();

    expect(startAction["setSpinnerText"]).toHaveBeenCalledWith("Waiting for the simulator to be ready...");
    expect(mockSimulatorService.waitForSimulatorToBeReady).toHaveBeenCalled();

    expect(startAction["succeedSpinner"]).toHaveBeenCalledWith(
      "GenLayer simulator initialized successfully! Go to http://localhost:8080 in your browser to access it.",
    );
  });

  test("should fail when simulator fails to start", async () => {
    const errorMsg = new Error("runSimulator error");
    (mockSimulatorService.runSimulator as Mock).mockRejectedValueOnce(errorMsg);

    await startAction.execute(defaultOptions);

    expect(startAction["failSpinner"]).toHaveBeenCalledWith("Error starting the simulator", errorMsg);
  });

  test("should fail when waiting for simulator initialization times out", async () => {
    (mockSimulatorService.waitForSimulatorToBeReady as Mock).mockResolvedValue({
      initialized: false,
      errorCode: "TIMEOUT",
    });

    await startAction.execute(defaultOptions);

    expect(startAction["failSpinner"]).toHaveBeenCalledWith(
      "The simulator is taking too long to initialize. Please try again later.",
    );
  });

  test("should reset the database if resetDb is true", async () => {
    const options: StartActionOptions = {...defaultOptions, resetDb: true};

    mockSimulatorService.cleanDatabase = vi.fn().mockResolvedValue(undefined);

    await startAction.execute(options);

    expect(startAction["setSpinnerText"]).toHaveBeenCalledWith("Resetting database...");
    expect(mockSimulatorService.cleanDatabase).toHaveBeenCalled();
  });

  test("should initialize validators when resetValidators is true", async () => {
    const options: StartActionOptions = {...defaultOptions, resetValidators: true};

    mockSimulatorService.deleteAllValidators = vi.fn().mockResolvedValue(undefined);
    mockSimulatorService.createRandomValidators = vi.fn().mockResolvedValue(undefined);
    mockSimulatorService.getAiProvidersOptions = vi.fn().mockReturnValue(["Provider1", "Provider2"]);

    vi.mocked(inquirer.prompt).mockResolvedValue({selectedLlmProviders: ["Provider1"]});

    await startAction.execute(options);

    expect(startAction["setSpinnerText"]).toHaveBeenCalledWith("Initializing validators...");
    expect(mockSimulatorService.deleteAllValidators).toHaveBeenCalled();
    expect(mockSimulatorService.createRandomValidators).toHaveBeenCalledWith(5, ["Provider1"]);
  });

  test("should fail when initializing validators fails", async () => {
    const options: StartActionOptions = {...defaultOptions, resetValidators: true};

    mockSimulatorService.deleteAllValidators = vi
      .fn()
      .mockRejectedValue(new Error("Failed to delete validators"));

    await startAction.execute(options);

    expect(startAction["failSpinner"]).toHaveBeenCalledWith(
      "Unable to initialize the validators",
      expect.any(Error),
    );
  });

  test("should open frontend when not in headless mode", async () => {
    mockSimulatorService.checkCliVersion = vi.fn().mockResolvedValue(undefined);
    mockSimulatorService.runSimulator = vi.fn().mockResolvedValue(undefined);
    mockSimulatorService.getFrontendUrl = vi.fn().mockReturnValue("http://localhost:8080");
    mockSimulatorService.openFrontend = vi.fn().mockResolvedValue(undefined);

    await startAction.execute(defaultOptions);

    expect(startAction["startSpinner"]).toHaveBeenCalledWith("Opening frontend...");
    expect(mockSimulatorService.openFrontend).toHaveBeenCalled();
    expect(startAction["succeedSpinner"]).toHaveBeenCalledWith("Frontend opened successfully");
  });

  test("should handle errors when opening frontend", async () => {
    const errorMsg = new Error("Failed to open frontend");
    (mockSimulatorService.openFrontend as Mock).mockRejectedValueOnce(errorMsg);

    await startAction.execute(defaultOptions);

    expect(startAction["failSpinner"]).toHaveBeenCalledWith("Error opening the frontend", errorMsg);
  });

  test("should log specific message if waitForSimulatorToBeReady returns TIMEOUT errorCode", async () => {
    (mockSimulatorService.waitForSimulatorToBeReady as Mock).mockResolvedValue({
      initialized: false,
      errorCode: "TIMEOUT",
      errorMessage: "Initialization timed out",
    });

    await startAction.execute(defaultOptions);

    expect(startAction["failSpinner"]).toHaveBeenCalledWith(
      "The simulator is taking too long to initialize. Please try again later.",
    );
  });

  test("should log error message if simulator fails to initialize with ERROR code", async () => {
    (mockSimulatorService.waitForSimulatorToBeReady as Mock).mockResolvedValue({
      initialized: false,
      errorCode: "ERROR",
      errorMessage: "Initialization failed",
    });

    await startAction.execute(defaultOptions);

    expect(startAction["failSpinner"]).toHaveBeenCalledWith(
      "Unable to initialize the GenLayer simulator.",
      "Initialization failed",
    );
  });

  test("catches and logs error if waitForSimulatorToBeReady throws an exception", async () => {
    const errorMsg = new Error("Unexpected initialization error");
    (mockSimulatorService.waitForSimulatorToBeReady as Mock).mockRejectedValueOnce(errorMsg);

    await startAction.execute(defaultOptions);

    expect(startAction["failSpinner"]).toHaveBeenCalledWith(
      "Error waiting for the simulator to be ready",
      errorMsg,
    );
  });

  test("should not append frontend URL when in headless mode", async () => {
    await startAction.execute({...defaultOptions, headless: true});

    expect(startAction["succeedSpinner"]).toHaveBeenCalledWith(
      "GenLayer simulator initialized successfully! ",
    );
  });

  test("should exclude ollama from choices when ollama option is false", async () => {
    await startAction.execute({ ...defaultOptions, resetValidators: true, ollama: false });
    
    expect(mockSimulatorService.getAiProvidersOptions).toHaveBeenCalledWith(false, ["ollama"]);
  });

  test("should include ollama in choices when ollama option is true", async () => {
    await startAction.execute({ ...defaultOptions, resetValidators: true, ollama: true });

    expect(mockSimulatorService.getAiProvidersOptions).toHaveBeenCalledWith(false, []);
  });
});
