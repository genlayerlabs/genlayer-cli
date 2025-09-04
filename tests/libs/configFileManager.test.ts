import { describe, test, vi, beforeEach, afterEach, expect } from "vitest";
import { ConfigFileManager } from "../../src/lib/config/ConfigFileManager";
import fs from "fs";
import os from "os";
import path from "path";

vi.mock("fs");

vi.mock("os")

describe("ConfigFileManager", () => {
  const mockFolderPath = "/mocked/home/.genlayer";
  const mockConfigFilePath = `${mockFolderPath}/genlayer-config.json`;

  let configFileManager: ConfigFileManager;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(os.homedir).mockReturnValue("/mocked/home");
    configFileManager = new ConfigFileManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("ensures folder and config file are created if they don't exist", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    new ConfigFileManager();

    expect(fs.existsSync).toHaveBeenCalledWith(mockFolderPath);
    expect(fs.mkdirSync).toHaveBeenCalledWith(mockFolderPath, { recursive: true });

    expect(fs.existsSync).toHaveBeenCalledWith(mockConfigFilePath);
    expect(fs.writeFileSync).toHaveBeenCalledWith(mockConfigFilePath, JSON.stringify({}, null, 2));
  });

  test("does not recreate folder or config file if they exist", () => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(true);

    new ConfigFileManager();

    expect(fs.mkdirSync).not.toHaveBeenCalled();
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  test("getFolderPath returns the correct folder path", () => {
    expect(configFileManager.getFolderPath()).toBe(mockFolderPath);
  });

  test("getFilePath returns the correct file path for a given file name", () => {
    const fileName = "example.json";
    const expectedFilePath = path.resolve(mockFolderPath, fileName);

    expect(configFileManager.getFilePath(fileName)).toBe(expectedFilePath);
  });

  test("getConfig returns the parsed content of the config file", () => {
    const mockConfig = { key: "value" };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));

    const config = configFileManager.getConfig();

    expect(fs.readFileSync).toHaveBeenCalledWith(mockConfigFilePath, "utf-8");
    expect(config).toEqual(mockConfig);
  });

  test("getConfigByKey returns the value for a given key", () => {
    const mockConfig = { key: "value" };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));

    const value = configFileManager.getConfigByKey("key");

    expect(value).toBe("value");
  });

  test("getConfigByKey returns null for a non-existing key", () => {
    const mockConfig = { key: "value" };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));

    const value = configFileManager.getConfigByKey("nonExistingKey");

    expect(value).toBeNull();
  });

  test("writeConfig updates the config file with a new key-value pair", () => {
    const mockConfig = { existingKey: "existingValue" };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));

    configFileManager.writeConfig("newKey", "newValue");

    const expectedConfig = { existingKey: "existingValue", newKey: "newValue" };
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      mockConfigFilePath,
      JSON.stringify(expectedConfig, null, 2)
    );
  });

  test("writeConfig overwrites an existing key in the config file", () => {
    const existingConfig = { existingKey: "existingValue" };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(existingConfig));

    configFileManager.writeConfig("existingKey", "newValue");

    const expectedConfig = { existingKey: "newValue" };
    expect(fs.writeFileSync).toHaveBeenCalledWith(mockConfigFilePath, JSON.stringify(expectedConfig, null, 2));
  });
});
