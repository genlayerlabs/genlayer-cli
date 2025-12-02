import {describe, test, vi, beforeEach, afterEach, expect} from "vitest";
import {UnlockAccountAction} from "../../src/commands/account/unlock";
import {readFileSync, existsSync} from "fs";
import {ethers} from "ethers";
import inquirer from "inquirer";

vi.mock("fs");
vi.mock("ethers");
vi.mock("inquirer");

describe("UnlockAccountAction", () => {
  let unlockAction: UnlockAccountAction;
  const mockKeystoreData = {
    version: 1,
    encrypted: '{"address":"test","crypto":{"cipher":"aes-128-ctr"}}',
    address: "0x1234567890123456789012345678901234567890"
  };
  const mockWallet = {
    privateKey: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
  };

  beforeEach(() => {
    vi.clearAllMocks();
    unlockAction = new UnlockAccountAction();
    
    // Mock the BaseAction methods
    vi.spyOn(unlockAction as any, "startSpinner").mockImplementation(() => {});
    vi.spyOn(unlockAction as any, "setSpinnerText").mockImplementation(() => {});
    vi.spyOn(unlockAction as any, "stopSpinner").mockImplementation(() => {});
    vi.spyOn(unlockAction as any, "succeedSpinner").mockImplementation(() => {});
    vi.spyOn(unlockAction as any, "failSpinner").mockImplementation(() => {});
    vi.spyOn(unlockAction as any, "promptPassword").mockResolvedValue("test-password");
    vi.spyOn(unlockAction as any, "getConfigByKey").mockReturnValue("./test-keypair.json");
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
    expect(unlockAction["setSpinnerText"]).toHaveBeenCalledWith("Checking for existing account...");
    expect(unlockAction["getConfigByKey"]).toHaveBeenCalledWith("keyPairPath");
    expect(existsSync).toHaveBeenCalledWith("./test-keypair.json");
    expect(unlockAction["stopSpinner"]).toHaveBeenCalled();
    expect(unlockAction["promptPassword"]).toHaveBeenCalledWith("Enter password to unlock account:");
    expect(readFileSync).toHaveBeenCalledWith("./test-keypair.json", "utf-8");
    expect(ethers.Wallet.fromEncryptedJson).toHaveBeenCalledWith(mockKeystoreData.encrypted, "test-password");
    expect(unlockAction["keychainManager"].storePrivateKey).toHaveBeenCalledWith(mockWallet.privateKey);
    expect(unlockAction["succeedSpinner"]).toHaveBeenCalledWith("Account unlocked! Private key cached in OS keychain.");
  });

  test("fails when keychain is not available", async () => {
    vi.spyOn(unlockAction["keychainManager"], "isKeychainAvailable").mockResolvedValue(false);

    await unlockAction.execute();

    expect(unlockAction["failSpinner"]).toHaveBeenCalledWith("OS keychain is not available. This command requires a supported keychain (e.g. macOS Keychain, Windows Credential Manager, or GNOME Keyring).");
    expect(unlockAction["promptPassword"]).not.toHaveBeenCalled();
    expect(unlockAction["keychainManager"].storePrivateKey).not.toHaveBeenCalled();
  });

  test("fails when no keystore file is found", async () => {
    vi.spyOn(unlockAction as any, "getConfigByKey").mockReturnValue(null);

    await unlockAction.execute();

    expect(unlockAction["failSpinner"]).toHaveBeenCalledWith("No account found. Run 'genlayer account create' first.");
    expect(unlockAction["promptPassword"]).not.toHaveBeenCalled();
  });

  test("fails when keystore file does not exist", async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await unlockAction.execute();

    expect(unlockAction["failSpinner"]).toHaveBeenCalledWith("No account found. Run 'genlayer account create' first.");
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
}); 