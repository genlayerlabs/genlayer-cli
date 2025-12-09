import {describe, test, vi, beforeEach, afterEach, expect} from "vitest";
import {CreateAccountAction} from "../../src/commands/account/create";
import {readFileSync, existsSync} from "fs";
import os from "os";

vi.mock("fs");
vi.mock("os");

describe("CreateAccountAction", () => {
  let createAction: CreateAccountAction;
  const mockKeystorePath = "/mocked/home/.genlayer/keystores/main.json";

  beforeEach(() => {
    vi.clearAllMocks();
    // Setup mocks before creating the action (needed for constructor)
    vi.mocked(os.homedir).mockReturnValue("/mocked/home");
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({activeAccount: "default"}));

    createAction = new CreateAccountAction();

    // Mock the BaseAction methods
    vi.spyOn(createAction as any, "startSpinner").mockImplementation(() => {});
    vi.spyOn(createAction as any, "succeedSpinner").mockImplementation(() => {});
    vi.spyOn(createAction as any, "failSpinner").mockImplementation(() => {});
    vi.spyOn(createAction as any, "createKeypairByName").mockResolvedValue("0x1234567890abcdef");
    vi.spyOn(createAction as any, "setActiveAccount").mockImplementation(() => {});
    vi.spyOn(createAction as any, "getKeystorePath").mockReturnValue(mockKeystorePath);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("successfully creates and saves an encrypted keystore", async () => {
    const options = {name: "main", overwrite: false, setActive: true};

    await createAction.execute(options);

    expect(createAction["startSpinner"]).toHaveBeenCalledWith("Creating account 'main'...");
    expect(createAction["createKeypairByName"]).toHaveBeenCalledWith("main", false);
    expect(createAction["setActiveAccount"]).toHaveBeenCalledWith("main");
    expect(createAction["succeedSpinner"]).toHaveBeenCalledWith(
      `Account 'main' created at: ${mockKeystorePath}`,
    );
  });

  test("handles errors during keystore creation", async () => {
    const mockError = new Error("Mocked creation error");
    vi.spyOn(createAction as any, "createKeypairByName").mockRejectedValue(mockError);

    await createAction.execute({name: "main", overwrite: true});

    expect(createAction["failSpinner"]).toHaveBeenCalledWith("Failed to create account", mockError);
  });

  test("skips setting active account when setActive is false", async () => {
    const options = {name: "validator", overwrite: false, setActive: false};

    await createAction.execute(options);

    expect(createAction["setActiveAccount"]).not.toHaveBeenCalled();
    expect(createAction["succeedSpinner"]).toHaveBeenCalled();
  });
});
