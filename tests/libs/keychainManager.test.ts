import {describe, test, vi, beforeEach, afterEach, expect} from "vitest";
import {KeychainManager} from "../../src/lib/config/KeychainManager";
import keytar from "keytar";

vi.mock("keytar");

describe("KeychainManager", () => {
  let keychainManager: KeychainManager;

  beforeEach(() => {
    vi.clearAllMocks();
    keychainManager = new KeychainManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("isKeychainAvailable", () => {
    test("returns true when keychain is available", async () => {
      vi.mocked(keytar.findCredentials).mockResolvedValue([]);

      const result = await keychainManager.isKeychainAvailable();

      expect(result).toBe(true);
      expect(keytar.findCredentials).toHaveBeenCalledWith("test-service");
    });

    test("returns false when keychain is not available", async () => {
      vi.mocked(keytar.findCredentials).mockRejectedValue(new Error("Keychain not available"));

      const result = await keychainManager.isKeychainAvailable();

      expect(result).toBe(false);
      expect(keytar.findCredentials).toHaveBeenCalledWith("test-service");
    });
  });

  describe("storePrivateKey", () => {
    test("successfully stores private key", async () => {
      const privateKey = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
      vi.mocked(keytar.setPassword).mockResolvedValue();

      await keychainManager.storePrivateKey("main", privateKey);

      expect(keytar.setPassword).toHaveBeenCalledWith("genlayer-cli", "account:main", privateKey);
    });

    test("handles storage error", async () => {
      const privateKey = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
      vi.mocked(keytar.setPassword).mockRejectedValue(new Error("Storage failed"));

      await expect(keychainManager.storePrivateKey("main", privateKey)).rejects.toThrow("Storage failed");
      expect(keytar.setPassword).toHaveBeenCalledWith("genlayer-cli", "account:main", privateKey);
    });
  });

  describe("getPrivateKey", () => {
    test("returns private key when it exists", async () => {
      const expectedKey = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
      vi.mocked(keytar.getPassword).mockResolvedValue(expectedKey);

      const result = await keychainManager.getPrivateKey("main");

      expect(result).toBe(expectedKey);
      expect(keytar.getPassword).toHaveBeenCalledWith("genlayer-cli", "account:main");
    });

    test("returns null when private key does not exist", async () => {
      vi.mocked(keytar.getPassword).mockResolvedValue(null);

      const result = await keychainManager.getPrivateKey("main");

      expect(result).toBeNull();
      expect(keytar.getPassword).toHaveBeenCalledWith("genlayer-cli", "account:main");
    });

    test("handles retrieval error", async () => {
      vi.mocked(keytar.getPassword).mockRejectedValue(new Error("Retrieval failed"));

      await expect(keychainManager.getPrivateKey("main")).rejects.toThrow("Retrieval failed");
      expect(keytar.getPassword).toHaveBeenCalledWith("genlayer-cli", "account:main");
    });
  });

  describe("removePrivateKey", () => {
    test("successfully removes private key", async () => {
      vi.mocked(keytar.deletePassword).mockResolvedValue(true);

      const result = await keychainManager.removePrivateKey("main");

      expect(result).toBe(true);
      expect(keytar.deletePassword).toHaveBeenCalledWith("genlayer-cli", "account:main");
    });

    test("returns false when key does not exist", async () => {
      vi.mocked(keytar.deletePassword).mockResolvedValue(false);

      const result = await keychainManager.removePrivateKey("main");

      expect(result).toBe(false);
      expect(keytar.deletePassword).toHaveBeenCalledWith("genlayer-cli", "account:main");
    });

    test("handles removal error", async () => {
      vi.mocked(keytar.deletePassword).mockRejectedValue(new Error("Removal failed"));

      await expect(keychainManager.removePrivateKey("main")).rejects.toThrow("Removal failed");
      expect(keytar.deletePassword).toHaveBeenCalledWith("genlayer-cli", "account:main");
    });
  });

  describe("listUnlockedAccounts", () => {
    test("returns list of unlocked account names", async () => {
      vi.mocked(keytar.findCredentials).mockResolvedValue([
        {account: "account:main", password: "key1"},
        {account: "account:validator", password: "key2"},
        {account: "other:something", password: "key3"},
      ]);

      const result = await keychainManager.listUnlockedAccounts();

      expect(result).toEqual(["main", "validator"]);
    });

    test("returns empty array when no accounts", async () => {
      vi.mocked(keytar.findCredentials).mockResolvedValue([]);

      const result = await keychainManager.listUnlockedAccounts();

      expect(result).toEqual([]);
    });
  });

  describe("isAccountUnlocked", () => {
    test("returns true when account is unlocked", async () => {
      vi.mocked(keytar.getPassword).mockResolvedValue("some-key");

      const result = await keychainManager.isAccountUnlocked("main");

      expect(result).toBe(true);
    });

    test("returns false when account is locked", async () => {
      vi.mocked(keytar.getPassword).mockResolvedValue(null);

      const result = await keychainManager.isAccountUnlocked("main");

      expect(result).toBe(false);
    });
  });
}); 