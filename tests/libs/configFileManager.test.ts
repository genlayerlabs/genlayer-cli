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
  const mockTempFolderPath = "/mocked/tmp/genlayer-temp";

  let configFileManager: ConfigFileManager;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(os.homedir).mockReturnValue("/mocked/home");
    vi.mocked(os.tmpdir).mockReturnValue("/mocked/tmp");
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

  describe("Temp File Operations", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(os.homedir).mockReturnValue("/mocked/home");
      vi.mocked(os.tmpdir).mockReturnValue("/mocked/tmp");
      configFileManager = new ConfigFileManager();
    });

    test("storeTempFile creates temp folder and stores file with timestamp", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const mockTimestamp = 1234567890;
      vi.spyOn(Date, 'now').mockReturnValue(mockTimestamp);

      configFileManager.storeTempFile("test.json", "test content");

      expect(fs.mkdirSync).toHaveBeenCalledWith("/mocked/tmp/genlayer-temp", { recursive: true, mode: 0o700 });
      
      const expectedData = {
        content: "test content",
        timestamp: mockTimestamp
      };
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        "/mocked/tmp/genlayer-temp/test.json", 
        JSON.stringify(expectedData), 
        { mode: 0o600 }
      );
    });

    test("storeTempFile does not create temp folder when it already exists", () => {
      vi.clearAllMocks();
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        if (path === "/mocked/home/.genlayer") return true;
        if (path === "/mocked/tmp/genlayer-temp") return true;
        return false;
      });
      
      const testConfigManager = new ConfigFileManager();
      
      const mockTimestamp = 1234567890;
      vi.spyOn(Date, 'now').mockReturnValue(mockTimestamp);

      testConfigManager.storeTempFile("test.json", "test content");

      expect(fs.mkdirSync).not.toHaveBeenCalled();
      
      const expectedData = {
        content: "test content",
        timestamp: mockTimestamp
      };
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        "/mocked/tmp/genlayer-temp/test.json", 
        JSON.stringify(expectedData), 
        { mode: 0o600 }
      );
    });

    test("getTempFile returns content when file exists and is not expired", () => {
      const mockTimestamp = Date.now() - 60000; // 1 minute ago
      const mockFileData = {
        content: "cached content",
        timestamp: mockTimestamp
      };
      
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockFileData));

      const result = configFileManager.getTempFile("test.json");

      expect(result).toBe("cached content");
      expect(fs.existsSync).toHaveBeenCalledWith("/mocked/tmp/genlayer-temp/test.json");
      expect(fs.readFileSync).toHaveBeenCalledWith("/mocked/tmp/genlayer-temp/test.json", "utf-8");
    });

    test("getTempFile returns null when file does not exist", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = configFileManager.getTempFile("nonexistent.json");

      expect(result).toBeNull();
      expect(fs.existsSync).toHaveBeenCalledWith("/mocked/tmp/genlayer-temp/nonexistent.json");
    });

    test("getTempFile returns null and clears file when expired", () => {
      const expiredTimestamp = Date.now() - (6 * 60 * 1000); // 6 minutes ago (expired)
      const mockFileData = {
        content: "expired content",
        timestamp: expiredTimestamp
      };
      
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockFileData));

      const result = configFileManager.getTempFile("expired.json");

      expect(result).toBeNull();
      expect(fs.unlinkSync).toHaveBeenCalledWith("/mocked/tmp/genlayer-temp/expired.json");
    });

    test("hasTempFile returns true when valid temp file exists", () => {
      const mockTimestamp = Date.now() - 60000; // 1 minute ago
      const mockFileData = {
        content: "test content",
        timestamp: mockTimestamp
      };
      
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockFileData));

      const result = configFileManager.hasTempFile("test.json");

      expect(result).toBe(true);
    });

    test("hasTempFile returns false when temp file is expired", () => {
      const expiredTimestamp = Date.now() - (6 * 60 * 1000); // 6 minutes ago
      const mockFileData = {
        content: "expired content",
        timestamp: expiredTimestamp
      };
      
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockFileData));

      const result = configFileManager.hasTempFile("expired.json");

      expect(result).toBe(false);
    });

    test("clearTempFile removes specific temp file", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      configFileManager.clearTempFile("test.json");

      expect(fs.existsSync).toHaveBeenCalledWith("/mocked/tmp/genlayer-temp/test.json");
      expect(fs.unlinkSync).toHaveBeenCalledWith("/mocked/tmp/genlayer-temp/test.json");
    });

    test("clearTempFile does nothing when file does not exist", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      configFileManager.clearTempFile("nonexistent.json");

      expect(fs.existsSync).toHaveBeenCalledWith("/mocked/tmp/genlayer-temp/nonexistent.json");
      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });

    test("cleanupExpiredTempFiles removes only expired files", () => {
      const now = Date.now();
      const validTimestamp = now - 60000; // 1 minute ago (valid)
      const expiredTimestamp = now - (6 * 60 * 1000); // 6 minutes ago (expired)
      
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['valid.json', 'expired.json'] as any);
      
      vi.mocked(fs.readFileSync)
        .mockReturnValueOnce(JSON.stringify({content: "valid", timestamp: validTimestamp}))
        .mockReturnValueOnce(JSON.stringify({content: "expired", timestamp: expiredTimestamp}));
      
      vi.spyOn(Date, 'now').mockReturnValue(now);

      configFileManager.cleanupExpiredTempFiles();

      expect(fs.readdirSync).toHaveBeenCalledWith("/mocked/tmp/genlayer-temp");
      expect(fs.readFileSync).toHaveBeenCalledWith("/mocked/tmp/genlayer-temp/valid.json", "utf-8");
      expect(fs.readFileSync).toHaveBeenCalledWith("/mocked/tmp/genlayer-temp/expired.json", "utf-8");
      expect(fs.unlinkSync).toHaveBeenCalledWith("/mocked/tmp/genlayer-temp/expired.json");
      expect(fs.unlinkSync).toHaveBeenCalledTimes(1); // Only expired file should be deleted
    });

    test("cleanupExpiredTempFiles does nothing when temp folder does not exist", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      configFileManager.cleanupExpiredTempFiles();

      expect(fs.existsSync).toHaveBeenCalledWith("/mocked/tmp/genlayer-temp");
      expect(fs.readdirSync).not.toHaveBeenCalled();
    });
  });
});
