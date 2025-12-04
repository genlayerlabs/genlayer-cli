import {describe, test, vi, beforeEach, afterEach, expect} from "vitest";
import {LockAccountAction} from "../../src/commands/account/lock";
import {readFileSync, existsSync} from "fs";
import os from "os";

vi.mock("fs");
vi.mock("os");

describe("LockAccountAction", () => {
  let lockAction: LockAccountAction;

  beforeEach(() => {
    vi.clearAllMocks();
    // Setup mocks before creating the action (needed for constructor)
    vi.mocked(os.homedir).mockReturnValue("/mocked/home");
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({activeAccount: "default"}));

    lockAction = new LockAccountAction();

    // Mock the BaseAction methods
    vi.spyOn(lockAction as any, "startSpinner").mockImplementation(() => {});
    vi.spyOn(lockAction as any, "setSpinnerText").mockImplementation(() => {});
    vi.spyOn(lockAction as any, "succeedSpinner").mockImplementation(() => {});
    vi.spyOn(lockAction as any, "failSpinner").mockImplementation(() => {});
    vi.spyOn(lockAction as any, "resolveAccountName").mockReturnValue("default");

    // Mock keychainManager
    vi.spyOn(lockAction["keychainManager"], "isKeychainAvailable").mockResolvedValue(true);
    vi.spyOn(lockAction["keychainManager"], "getPrivateKey").mockResolvedValue("test-private-key");
    vi.spyOn(lockAction["keychainManager"], "removePrivateKey").mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("successfully locks wallet when keychain is available and key exists", async () => {
    await lockAction.execute();

    expect(lockAction["startSpinner"]).toHaveBeenCalledWith("Checking keychain availability...");
    expect(lockAction["keychainManager"].isKeychainAvailable).toHaveBeenCalled();
    expect(lockAction["setSpinnerText"]).toHaveBeenCalledWith("Checking for cached private key for 'default'...");
    expect(lockAction["keychainManager"].getPrivateKey).toHaveBeenCalledWith("default");
    expect(lockAction["setSpinnerText"]).toHaveBeenCalledWith("Removing private key for 'default' from OS keychain...");
    expect(lockAction["keychainManager"].removePrivateKey).toHaveBeenCalledWith("default");
    expect(lockAction["succeedSpinner"]).toHaveBeenCalledWith("Account 'default' locked! Private key removed from OS keychain.");
  });

  test("fails when keychain is not available", async () => {
    vi.spyOn(lockAction["keychainManager"], "isKeychainAvailable").mockResolvedValue(false);

    await lockAction.execute();

    expect(lockAction["failSpinner"]).toHaveBeenCalledWith("OS keychain is not available. This command requires a supported keychain (e.g. macOS Keychain, Windows Credential Manager, or GNOME Keyring).");
    expect(lockAction["keychainManager"].getPrivateKey).not.toHaveBeenCalled();
    expect(lockAction["keychainManager"].removePrivateKey).not.toHaveBeenCalled();
  });

  test("succeeds when wallet is already locked (no cached key)", async () => {
    vi.spyOn(lockAction["keychainManager"], "getPrivateKey").mockResolvedValue(null);

    await lockAction.execute();

    expect(lockAction["succeedSpinner"]).toHaveBeenCalledWith("Account 'default' is already locked.");
    expect(lockAction["keychainManager"].removePrivateKey).not.toHaveBeenCalled();
  });

  test("handles error during key removal", async () => {
    const mockError = new Error("Keychain error");
    vi.spyOn(lockAction["keychainManager"], "removePrivateKey").mockRejectedValue(mockError);

    await lockAction.execute();

    expect(lockAction["failSpinner"]).toHaveBeenCalledWith("Failed to lock account.", mockError);
  });

  test("uses account option when provided", async () => {
    vi.spyOn(lockAction as any, "resolveAccountName").mockReturnValue("validator");

    await lockAction.execute({account: "validator"});

    expect(lockAction["accountOverride"]).toBe("validator");
    expect(lockAction["setSpinnerText"]).toHaveBeenCalledWith("Checking for cached private key for 'validator'...");
  });
}); 