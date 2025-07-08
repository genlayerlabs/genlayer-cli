import {describe, test, vi, beforeEach, afterEach, expect, Mock} from "vitest";
import {BaseAction} from "../../src/lib/actions/BaseAction";
import inquirer from "inquirer";
import ora, {Ora} from "ora";
import chalk from "chalk";
import {inspect} from "util";
import { ethers } from "ethers";
import { writeFileSync, existsSync, readFileSync } from "fs";

vi.mock("inquirer");
vi.mock("ora");
vi.mock("fs");
vi.mock("ethers");

describe("BaseAction", () => {
  let baseAction: BaseAction;
  let mockSpinner: Ora;
  let consoleSpy: any;
  let consoleErrorSpy: any;
  let processExitSpy: any;

  const mockKeystoreData = {
    version: 1,
    encrypted: '{"address":"test","crypto":{"cipher":"aes-128-ctr"}}',
    address: "0x1234567890123456789012345678901234567890",
  };

  const mockWallet = {
    privateKey: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    address: "0x1234567890123456789012345678901234567890",
    encrypt: vi.fn().mockResolvedValue('{"address":"test","crypto":{"cipher":"aes-128-ctr"}}'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process exited");
    });
    mockSpinner = {
      start: vi.fn(),
      stop: vi.fn(),
      succeed: vi.fn(),
      fail: vi.fn(),
      text: "",
    } as unknown as Ora;

    (ora as unknown as Mock).mockReturnValue(mockSpinner);
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockKeystoreData));
    vi.mocked(writeFileSync).mockImplementation(() => {});

    // Mock ethers
    vi.mocked(ethers.Wallet.createRandom).mockReturnValue(mockWallet as any);
    vi.mocked(ethers.Wallet.fromEncryptedJson).mockResolvedValue(mockWallet as any);

    baseAction = new BaseAction();

    // Mock config methods
    vi.spyOn(baseAction as any, "getConfigByKey").mockReturnValue("./test-keypair.json");
    vi.spyOn(baseAction as any, "getFilePath").mockImplementation(() => "./test-keypair.json");
    vi.spyOn(baseAction as any, "writeConfig").mockImplementation(() => {});
    vi.spyOn(baseAction as any, "getConfig").mockReturnValue({});
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

  test("should prompt for password successfully", async () => {
    const mockPassword = "test-password";
    vi.mocked(inquirer.prompt).mockResolvedValue({password: mockPassword});

    const result = await baseAction["promptPassword"]("Enter password:");
    
    expect(result).toBe(mockPassword);
    expect(inquirer.prompt).toHaveBeenCalledWith([{
      type: "password",
      name: "password",
      message: chalk.yellow("Enter password:"),
      mask: "*",
      validate: expect.any(Function),
    }]);
  });

  test("should validate password input is not empty", async () => {
    vi.mocked(inquirer.prompt).mockResolvedValue({password: "valid-password"});

    await baseAction["promptPassword"]("Enter password:");
    
    const mockCall = vi.mocked(inquirer.prompt).mock.calls[0];
    const questions = mockCall[0] as any;
    const validateFn = questions[0].validate;
    expect(validateFn("")).toBe("Password cannot be empty");
    expect(validateFn("valid")).toBe(true);
  });

  test("should return private key when keystore exists and is valid", async () => {
    vi.mocked(inquirer.prompt).mockResolvedValue({password: "correct-password"});

    const result = await baseAction["getPrivateKey"]();

    expect(result).toBe(mockWallet.privateKey);
    expect(existsSync).toHaveBeenCalledWith("./test-keypair.json");
    expect(readFileSync).toHaveBeenCalledWith("./test-keypair.json", "utf-8");
  });

  test("should create new keypair when keystore file does not exist", async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(inquirer.prompt)
      .mockResolvedValueOnce({confirmAction: true}) // confirm create new
      .mockResolvedValueOnce({password: "new-password"}) // encrypt password
      .mockResolvedValueOnce({password: "new-password"}); // confirm password

    const result = await baseAction["getPrivateKey"]();

    expect(result).toBe(mockWallet.privateKey);
    expect(inquirer.prompt).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({message: chalk.yellow("Keypair file not found. Would you like to create a new keypair?")})
    ]));
  });

  test("should fail when keystore format is invalid and user declines", async () => {
    vi.mocked(readFileSync).mockReturnValue('{"invalid": "format"}');
    vi.mocked(inquirer.prompt).mockResolvedValue({confirmAction: false});

    await expect(baseAction["getPrivateKey"]()).rejects.toThrow("process exited");
    expect(mockSpinner.fail).toHaveBeenCalledWith(chalk.red("Invalid keystore format. Expected encrypted keystore file."));
  });

  test("should create new keypair when keystore format is invalid and user confirms", async () => {
    vi.mocked(readFileSync).mockReturnValue('{"invalid": "format"}');
    vi.mocked(inquirer.prompt)
      .mockResolvedValueOnce({confirmAction: true})
      .mockResolvedValueOnce({password: "new-password"})
      .mockResolvedValueOnce({password: "new-password"});

    const result = await baseAction["getPrivateKey"]();

    expect(result).toBe(mockWallet.privateKey);
    expect(mockSpinner.fail).toHaveBeenCalledWith(chalk.red("Invalid keystore format. Expected encrypted keystore file."));
    expect(inquirer.prompt).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({message: chalk.yellow("Would you like to create a new keypair?")})
    ]));
  });

  test("should decrypt keystore successfully on first attempt", async () => {
    vi.mocked(inquirer.prompt).mockResolvedValue({password: "correct-password"});

    const result = await baseAction["decryptKeystore"](mockKeystoreData);

    expect(result).toBe(mockWallet.privateKey);
    expect(inquirer.prompt).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({message: chalk.yellow("Enter password to decrypt keystore:")})
    ]));
  });

  test("should retry on wrong password and succeed on second attempt", async () => {
    vi.mocked(ethers.Wallet.fromEncryptedJson)
      .mockRejectedValueOnce(new Error("Incorrect password"))
      .mockResolvedValueOnce(mockWallet as any);
    
    vi.mocked(inquirer.prompt)
      .mockResolvedValueOnce({password: "wrong-password"})
      .mockResolvedValueOnce({password: "correct-password"});

    const result = await baseAction["decryptKeystore"](mockKeystoreData);

    expect(result).toBe(mockWallet.privateKey);
    expect(inquirer.prompt).toHaveBeenCalledTimes(2);
    expect(inquirer.prompt).toHaveBeenNthCalledWith(2, expect.arrayContaining([
      expect.objectContaining({message: chalk.yellow("Invalid password. Attempt 2/3 - Enter password to decrypt keystore:")})
    ]));
  });

  test("should exit after 3 failed password attempts", async () => {
    vi.mocked(ethers.Wallet.fromEncryptedJson).mockRejectedValue(new Error("Incorrect password"));
    vi.mocked(inquirer.prompt).mockResolvedValue({password: "wrong-password"});

    await expect(baseAction["decryptKeystore"](mockKeystoreData)).rejects.toThrow("process exited");
    
    expect(inquirer.prompt).toHaveBeenCalledTimes(3);
    expect(mockSpinner.fail).toHaveBeenCalledWith(chalk.red("Maximum password attempts exceeded (3/3)."));
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  test("should create new keypair successfully", async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(inquirer.prompt)
      .mockResolvedValueOnce({password: "test-password"})
      .mockResolvedValueOnce({password: "test-password"});

    const result = await baseAction["createKeypair"]("./new-keypair.json", false);

    expect(result).toBe(mockWallet.privateKey);
    expect(ethers.Wallet.createRandom).toHaveBeenCalled();
    expect(mockWallet.encrypt).toHaveBeenCalledWith("test-password");
    expect(writeFileSync).toHaveBeenCalled();
  });

  test("should fail when file exists and overwrite is false", async () => {
    vi.mocked(existsSync).mockReturnValue(true);

    await expect(baseAction["createKeypair"]("./test-keypair.json", false)).rejects.toThrow("process exited");
    
    expect(mockSpinner.fail).toHaveBeenCalledWith(
      chalk.red("The file at ./test-keypair.json already exists. Use the '--overwrite' option to replace it.")
    );
  });

  test("should fail when passwords do not match", async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(inquirer.prompt)
      .mockResolvedValueOnce({password: "password1"})
      .mockResolvedValueOnce({password: "password2"});

    await expect(baseAction["createKeypair"]("./new-keypair.json", false)).rejects.toThrow("process exited");
    
    expect(mockSpinner.fail).toHaveBeenCalledWith(chalk.red("Passwords do not match"));
  });

  test("should fail when password is too short", async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(inquirer.prompt)
      .mockResolvedValueOnce({password: "short"})
      .mockResolvedValueOnce({password: "short"});

    await expect(baseAction["createKeypair"]("./new-keypair.json", false)).rejects.toThrow("process exited");
    
    expect(mockSpinner.fail).toHaveBeenCalledWith(chalk.red("Password must be at least 8 characters long"));
  });

  test("should overwrite existing file when overwrite is true", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(inquirer.prompt)
      .mockResolvedValueOnce({password: "test-password"})
      .mockResolvedValueOnce({password: "test-password"});

    const result = await baseAction["createKeypair"]("./existing.json", true);

    expect(result).toBe(mockWallet.privateKey);
    expect(writeFileSync).toHaveBeenCalled();
  });

  test("should return true for valid keystore format", () => {
    const validKeystore = {
      version: 1,
      encrypted: "encrypted-data",
      address: "0x1234567890123456789012345678901234567890",
    };

    const result = baseAction["isValidKeystoreFormat"](validKeystore);
    expect(result).toBe(true);
  });

  test("should return false for invalid keystore version", () => {
    const invalidKeystore = {
      version: 2,
      encrypted: "encrypted-data",
      address: "0x1234567890123456789012345678901234567890",
    };

    const result = baseAction["isValidKeystoreFormat"](invalidKeystore);
    expect(result).toBe(false);
  });

  test("should return false for keystore missing fields", () => {
    const invalidKeystore = {
      version: 1,
      encrypted: "encrypted-data",
    };

    const result = baseAction["isValidKeystoreFormat"](invalidKeystore);
    expect(result).toBe(false);
  });

  test("should return false for null or undefined keystore", () => {
    expect(baseAction["isValidKeystoreFormat"](null)).toBe(false);
    expect(baseAction["isValidKeystoreFormat"](undefined)).toBe(false);
  });

  describe("formatOutput", () => {
    test("should return string as is", () => {
      expect((baseAction as any).formatOutput("Hello")).toBe("Hello");
    });

    test("should format an object", () => {
      const data = {key: "value", num: 42};
      const result = (baseAction as any).formatOutput(data);
      expect(result).toBe("{ key: 'value', num: 42 }");
    });

    test("should format an error object", () => {
      const error = new Error("Test Error");
      const result = (baseAction as any).formatOutput(error);
      expect(result).toContain("Error: Test Error");
    });

    test("should format a Map object", () => {
      const testMap = new Map([["key1", "value1"]]);
      const result = (baseAction as any).formatOutput(testMap);
      expect(result).toBe("Map(1) { 'key1' => 'value1' }");
    });

    test("should format a BigInt object", () => {
      const bigIntValue = BigInt(9007199254740991);
      const result = (baseAction as any).formatOutput(bigIntValue);
      expect(result).toBe("9007199254740991n");
    });
  });
});
