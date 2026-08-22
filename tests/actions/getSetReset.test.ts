import { describe, test, vi, beforeEach, afterEach, expect } from "vitest";
import { ConfigActions } from "../../src/commands/config/getSetReset";
import { ConfigFileManager } from "../../src/lib/config/ConfigFileManager";

vi.mock("../../src/lib/config/ConfigFileManager");

describe("ConfigActions", () => {
  let configActions: ConfigActions;

  beforeEach(() => {
    configActions = new ConfigActions();
    vi.clearAllMocks();

    vi.spyOn(configActions as any, "startSpinner").mockImplementation(() => {});
    vi.spyOn(configActions as any, "succeedSpinner").mockImplementation(() => {});
    vi.spyOn(configActions as any, "failSpinner").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("set method writes key-value pair to the configuration", () => {
    configActions.set("defaultNetwork=testnet");

    expect(configActions["writeConfig"]).toHaveBeenCalledWith("defaultNetwork", "testnet");
    expect(configActions["startSpinner"]).toHaveBeenCalledWith("Updating configuration: defaultNetwork");
    expect(configActions["succeedSpinner"]).toHaveBeenCalledWith("Configuration successfully updated");
  });

  test("set method keeps '=' inside the value", () => {
    configActions.set("apiKey=YWJjZGVm==");

    expect(configActions["writeConfig"]).toHaveBeenCalledWith("apiKey", "YWJjZGVm==");
  });

  test("set method keeps a query string intact", () => {
    configActions.set("rpcUrl=https://rpc.example.com/v1?key=abc&mode=fast");

    expect(configActions["writeConfig"]).toHaveBeenCalledWith(
      "rpcUrl",
      "https://rpc.example.com/v1?key=abc&mode=fast",
    );
  });

  test("set method accepts an empty value", () => {
    configActions.set("defaultNetwork=");

    expect(configActions["writeConfig"]).toHaveBeenCalledWith("defaultNetwork", "");
  });

  test("set method fails for invalid format", () => {
    configActions.set("invalidFormat");

    expect(configActions["failSpinner"]).toHaveBeenCalledWith("Invalid format. Use 'key=value'.");
    expect(configActions["writeConfig"]).not.toHaveBeenCalled();
  });

  test("get method retrieves value for a specific key", () => {
    vi.mocked(ConfigFileManager.prototype.getConfigByKey).mockReturnValue("testnet");

    configActions.get("defaultNetwork");

    expect(configActions["getConfigByKey"]).toHaveBeenCalledWith("defaultNetwork");
    expect(configActions["startSpinner"]).toHaveBeenCalledWith("Retrieving value for: defaultNetwork");
    expect(configActions["succeedSpinner"]).toHaveBeenCalledWith("Configuration successfully retrieved", "defaultNetwork=testnet");
  });

  test("get method prints failure message when key does not exist", () => {
    vi.mocked(ConfigFileManager.prototype.getConfigByKey).mockReturnValue(null);

    configActions.get("nonexistentKey");

    expect(configActions["getConfigByKey"]).toHaveBeenCalledWith("nonexistentKey");
    expect(configActions["failSpinner"]).toHaveBeenCalledWith("No configuration found for 'nonexistentKey'.");
  });

  test("get method retrieves the entire configuration when no key is provided", () => {
    const mockConfig = { defaultNetwork: "testnet" };
    vi.mocked(ConfigFileManager.prototype.getConfig).mockReturnValue(mockConfig);

    configActions.get();

    expect(configActions["getConfig"]).toHaveBeenCalled();
    expect(configActions["startSpinner"]).toHaveBeenCalledWith("Retrieving all configurations");
    expect(configActions["succeedSpinner"]).toHaveBeenCalledWith("All configurations successfully retrieved", JSON.stringify(mockConfig, null, 2));
  });

  test("reset method removes key from configuration", () => {
    const mockConfig = { defaultNetwork: "testnet" };
    vi.mocked(ConfigFileManager.prototype.getConfig).mockReturnValue(mockConfig);

    configActions.reset("defaultNetwork");

    expect(configActions["getConfig"]).toHaveBeenCalled();
    expect(configActions["startSpinner"]).toHaveBeenCalledWith("Resetting configuration: defaultNetwork");
    expect(configActions["writeConfig"]).toHaveBeenCalledWith("defaultNetwork", undefined);
    expect(configActions["succeedSpinner"]).toHaveBeenCalledWith("Configuration successfully reset");
  });

  test("reset method prints failure message when key does not exist", () => {
    vi.mocked(ConfigFileManager.prototype.getConfig).mockReturnValue({});

    configActions.reset("nonexistentKey");

    expect(configActions["getConfig"]).toHaveBeenCalled();
    expect(configActions["failSpinner"]).toHaveBeenCalledWith("Configuration key 'nonexistentKey' does not exist.");
  });
});