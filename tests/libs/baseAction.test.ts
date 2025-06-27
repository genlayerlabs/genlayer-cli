import {describe, test, vi, beforeEach, afterEach, expect, Mock} from "vitest";
import {BaseAction} from "../../src/lib/actions/BaseAction";
import inquirer from "inquirer";
import ora, {Ora} from "ora";
import chalk from "chalk";
import {inspect} from "util";

vi.mock("inquirer");
vi.mock("ora");

describe("BaseAction", () => {
  let baseAction: BaseAction;
  let mockSpinner: Ora;
  let consoleSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockSpinner = {
      start: vi.fn(),
      stop: vi.fn(),
      succeed: vi.fn(),
      fail: vi.fn(),
      text: "",
    } as unknown as Ora;

    (ora as unknown as Mock).mockReturnValue(mockSpinner);

    baseAction = new BaseAction();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("should start the spinner with a message", () => {
    baseAction["startSpinner"]("Loading...");
    expect(mockSpinner.start).toHaveBeenCalled();
    expect(mockSpinner.text).toBe(chalk.blue("Loading..."));
  });

  test("should succeed the spinner with a message", () => {
    baseAction["succeedSpinner"]("Success");
    expect(consoleSpy).toHaveBeenCalledWith("");
    expect(mockSpinner.succeed).toHaveBeenCalledWith(expect.stringContaining("Success"));
  });

  test("should fail the spinner with an error message", () => {
    const error = new Error("Something went wrong");
    baseAction["failSpinner"]("Failure", error);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Error:"));
    expect(consoleSpy).toHaveBeenCalledWith(inspect(error, {depth: null, colors: false}));
    expect(consoleSpy).toHaveBeenCalledWith("");
    expect(mockSpinner.fail).toHaveBeenCalledWith(expect.stringContaining("Failure"));
  });

  test("should stop the spinner", () => {
    baseAction["stopSpinner"]();
    expect(mockSpinner.stop).toHaveBeenCalled();
  });

  test("should set spinner text", () => {
    baseAction["setSpinnerText"]("Updated text");
    expect(mockSpinner.text).toBe(chalk.blue("Updated text"));
  });

  test("should confirm prompt and proceed when confirmed", async () => {
    vi.mocked(inquirer.prompt).mockResolvedValue({confirmAction: true});

    await expect(baseAction["confirmPrompt"]("Are you sure?")).resolves.not.toThrow();
    expect(inquirer.prompt).toHaveBeenCalled();
  });

  test("should confirm prompt and exit when declined", async () => {
    vi.mocked(inquirer.prompt).mockResolvedValue({confirmAction: false});
    const processExitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process exited");
    });

    await expect(baseAction["confirmPrompt"]("Are you sure?")).rejects.toThrow("process exited");
    expect(inquirer.prompt).toHaveBeenCalled();
    expect(processExitSpy).toHaveBeenCalledWith(0);
  });

  test("should log a success message", () => {
    baseAction["logSuccess"]("Success message");

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("✔ Success message"));
  });

  test("should log an error message", () => {
    baseAction["logError"]("Error message");

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("✖ Error message"));
  });

  test("should log a info message", () => {
    baseAction["logInfo"]("Info message");

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("ℹ Info message"));
  });

  test("should log a warning message", () => {
    baseAction["logWarning"]("Warning message");

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("⚠ Warning message"));
  });

  test("should log a success message with data", () => {
    const data = {key: "value"};

    baseAction["logSuccess"]("Success message", data);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("✔ Success message"));
    expect(consoleSpy).toHaveBeenCalledWith(chalk.green(inspect(data, {depth: null, colors: false})));
  });

  test("should log an error message with error details", () => {
    const error = new Error("Something went wrong");

    baseAction["logError"]("Error message", error);

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("✖ Error message"));
    expect(consoleErrorSpy).toHaveBeenCalledWith(chalk.red(inspect(error, {depth: null, colors: false})));
  });

  test("should log an info message with data", () => {
    const data = {info: "This is some info"};

    baseAction["logInfo"]("Info message", data);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("ℹ Info message"));
    expect(consoleSpy).toHaveBeenCalledWith(chalk.blue(inspect(data, {depth: null, colors: false})));
  });

  test("should log a warning message with data", () => {
    const data = {warning: "This is a warning"};

    baseAction["logWarning"]("Warning message", data);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("⚠ Warning message"));
    expect(consoleSpy).toHaveBeenCalledWith(chalk.yellow(inspect(data, {depth: null, colors: false})));
  });

  test("should succeed the spinner with a message and log result if data is provided", () => {
    const mockData = {key: "value"};

    baseAction["succeedSpinner"]("Success", mockData);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Result:"));
    expect(consoleSpy).toHaveBeenCalledWith(inspect(mockData, {depth: null, colors: false}));
    expect(consoleSpy).toHaveBeenCalledWith("");
    expect(mockSpinner.succeed).toHaveBeenCalledWith(expect.stringContaining("Success"));
  });

  test("should return a string representation of a primitive", () => {
    expect((baseAction as any).formatOutput("Hello")).toBe("Hello");
    expect((baseAction as any).formatOutput(42)).toBe("42");
    expect((baseAction as any).formatOutput(true)).toBe("true");
  });
  const mockPrivateKey = "mocked_private_key";

  beforeEach(() => {
    baseAction["keypairManager"] = {
      getPrivateKey: vi.fn(),
      createKeypair: vi.fn(),
      getKeypairPath: vi.fn(),
      setKeypairPath: vi.fn(),
    } as any;
  });

  test("should return private key when it exists", async () => {
    vi.mocked(baseAction["keypairManager"].getPrivateKey).mockReturnValue(mockPrivateKey);

    const result = await baseAction["getPrivateKey"]();

    expect(result).toBe(mockPrivateKey);
    expect(baseAction["keypairManager"].createKeypair).not.toHaveBeenCalled();
  });

  test("should create new keypair when private key doesn't exist and user confirms", async () => {
    vi.mocked(baseAction["keypairManager"].getPrivateKey)
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce(mockPrivateKey);
    vi.mocked(inquirer.prompt).mockResolvedValue({confirmAction: true});
    await baseAction["getPrivateKey"]();

    expect(baseAction["keypairManager"].createKeypair).toHaveBeenCalled();
  });

  test("should exit when private key doesn't exist and user declines", async () => {
    vi.mocked(baseAction["keypairManager"].getPrivateKey).mockReturnValueOnce(undefined);
    vi.mocked(inquirer.prompt).mockResolvedValue({confirmAction: false});
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process exited");
    });

    await expect(baseAction["getPrivateKey"]()).rejects.toThrow("process exited");
  });

  describe("formatOutput", () => {
    test("should return string as is", () => {
      expect((baseAction as any).formatOutput("Hello")).toBe("Hello");
    });

    test("should format an object using util.inspect", () => {
      const data = {key: "value", num: 42};
      const result = (baseAction as any).formatOutput(data);
      expect(result).toBe(inspect(data, {depth: null, colors: false}));
    });

    test("should format an error object using util.inspect", () => {
      const error = new Error("Test Error");
      const result = (baseAction as any).formatOutput(error);
      expect(result).toBe(inspect(error, {depth: null, colors: false}));
    });

    test("should format a Map object using util.inspect", () => {
      const testMap = new Map([["key1", "value1"]]);
      const result = (baseAction as any).formatOutput(testMap);
      expect(result).toBe(inspect(testMap, {depth: null, colors: false}));
    });

    test("should format a BigInt object using util.inspect", () => {
      const bigIntValue = BigInt(9007199254740991);
      const result = (baseAction as any).formatOutput(bigIntValue);
      expect(result).toBe(inspect(bigIntValue, {depth: null, colors: false}));
    });
  });
});
