import {describe, test, vi, beforeEach, afterEach, expect} from "vitest";
import {UnlockAccountAction} from "../../src/commands/account/unlock";
import {readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync, unlinkSync, copyFileSync} from "fs";
import {ethers} from "ethers";
import inquirer from "inquirer";
import os from "os";

vi.mock("fs");
vi.mock("ethers");
vi.mock("inquirer");
vi.mock("os");

describe("UnlockAccountAction", () => {
  let unlockAction: UnlockAccountAction;
  // Standard web3 keystore format
  const mockKeystoreData = {
    address: "1234567890123456789012345678901234567890",
    crypto: {
      cipher: "aes-128-ctr",
      ciphertext: "test",
      cipherparams: {iv: "test"},
      kdf: "scrypt",
      kdfparams: {},
      mac: "test"
    },
    version: 3
  };
  const mockWallet = {
    privateKey: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
  };
  const mockKeystorePath = "/mocked/home/.genlayer/keystores/default.json";

  beforeEach(() => {
    vi.clearAllMocks();
    // Setup mocks before creating the action (needed for constructor)
    vi.mocked(os.homedir).mockReturnValue("/mocked/home");
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({activeAccount: "default"}));

    unlockAction = new UnlockAccountAction();

    // Mock the BaseAction methods
    vi.spyOn(unlockAction as any, "startSpinner").mockImplementation(() => {});
    vi.spyOn(unlockAction as any, "setSpinnerText").mockImplementation(() => {});
    vi.spyOn(unlockAction as any, "stopSpinner").mockImplementation(() => {});
    vi.spyOn(unlockAction as any, "succeedSpinner").mockImplementation(() => {});
    vi.spyOn(unlockAction as any, "failSpinner").mockImplementation(() => {});
    vi.spyOn(unlockAction as any, "promptPassword").mockResolvedValue("test-password");
    vi.spyOn(unlockAction as any, "getKeystorePath").mockReturnValue(mockKeystorePath);
    vi.spyOn(unlockAction as any, "resolveAccountName").mockReturnValue("default");
    vi.spyOn(unlockAction as any, "isValidKeystoreFormat").mockReturnValue(true);

    // Mock keychainManager
    vi.spyOn(unlockAction["keychainManager"], "isKeychainAvailable").mockResolvedValue(true);
    vi.spyOn(unlockAction["keychainManager"], "storePrivateKey").mockResolvedValue();

    // Mock fs and ethers
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockKeystoreData));
    vi.mocked(ethers.Wallet.fromEncryptedJson).mockResolvedValue(mockWallet as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("successfully unlocks wallet when all conditions are met", async () => {
    await unlockAction.execute();

    expect(unlockAction["startSpinner"]).toHaveBeenCalledWith("Checking keychain availability...");
    expect(unlockAction["keychainManager"].isKeychainAvailable).toHaveBeenCalled();
    expect(unlockAction["setSpinnerText"]).toHaveBeenCalledWith("Checking for account 'default'...");
    expect(unlockAction["getKeystorePath"]).toHaveBeenCalledWith("default");
    expect(existsSync).toHaveBeenCalledWith(mockKeystorePath);
    expect(unlockAction["stopSpinner"]).toHaveBeenCalled();
    expect(unlockAction["promptPassword"]).toHaveBeenCalledWith("Enter password to unlock 'default':");
    expect(readFileSync).toHaveBeenCalledWith(mockKeystorePath, "utf-8");
    expect(ethers.Wallet.fromEncryptedJson).toHaveBeenCalledWith(JSON.stringify(mockKeystoreData), "test-password");
    expect(unlockAction["keychainManager"].storePrivateKey).toHaveBeenCalledWith("default", mockWallet.privateKey);
    expect(unlockAction["succeedSpinner"]).toHaveBeenCalledWith("Account 'default' unlocked! Private key cached in OS keychain.");
  });

  test("fails when keychain is not available", async () => {
    vi.spyOn(unlockAction["keychainManager"], "isKeychainAvailable").mockResolvedValue(false);

    await unlockAction.execute();

    expect(unlockAction["failSpinner"]).toHaveBeenCalledWith("OS keychain is not available. This command requires a supported keychain (e.g. macOS Keychain, Windows Credential Manager, or GNOME Keyring).");
    expect(unlockAction["promptPassword"]).not.toHaveBeenCalled();
    expect(unlockAction["keychainManager"].storePrivateKey).not.toHaveBeenCalled();
  });

  test("fails when keystore file does not exist", async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await unlockAction.execute();

    expect(unlockAction["failSpinner"]).toHaveBeenCalledWith("Account 'default' not found. Run 'genlayer account create --name default' first.");
    expect(unlockAction["promptPassword"]).not.toHaveBeenCalled();
  });

  test("fails when keystore format is invalid", async () => {
    vi.spyOn(unlockAction as any, "isValidKeystoreFormat").mockReturnValue(false);

    await unlockAction.execute();

    expect(unlockAction["failSpinner"]).toHaveBeenCalledWith("Invalid keystore format.");
    expect(unlockAction["promptPassword"]).not.toHaveBeenCalled();
  });

  test("handles error during wallet decryption", async () => {
    const mockError = new Error("Decryption failed");
    vi.mocked(ethers.Wallet.fromEncryptedJson).mockRejectedValue(mockError);

    await unlockAction.execute();

    expect(unlockAction["failSpinner"]).toHaveBeenCalledWith("Failed to unlock account.", mockError);
    expect(unlockAction["keychainManager"].storePrivateKey).not.toHaveBeenCalled();
  });

  test("handles error during key storage", async () => {
    const mockError = new Error("Storage failed");
    vi.spyOn(unlockAction["keychainManager"], "storePrivateKey").mockRejectedValue(mockError);

    await unlockAction.execute();

    expect(unlockAction["failSpinner"]).toHaveBeenCalledWith("Failed to unlock account.", mockError);
  });

  test("uses account option when provided", async () => {
    vi.spyOn(unlockAction as any, "resolveAccountName").mockReturnValue("validator");
    vi.spyOn(unlockAction as any, "getKeystorePath").mockReturnValue("/mocked/home/.genlayer/keystores/validator.json");

    await unlockAction.execute({account: "validator"});

    expect(unlockAction["accountOverride"]).toBe("validator");
    expect(unlockAction["setSpinnerText"]).toHaveBeenCalledWith("Checking for account 'validator'...");
  });
}); 