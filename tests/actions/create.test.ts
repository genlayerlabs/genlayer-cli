import {describe, test, vi, beforeEach, afterEach, expect} from "vitest";
import {CreateAccountAction} from "../../src/commands/account/create";

describe("CreateAccountAction", () => {
  let createAction: CreateAccountAction;

  beforeEach(() => {
    vi.clearAllMocks();
    createAction = new CreateAccountAction();

    // Mock the BaseAction methods
    vi.spyOn(createAction as any, "startSpinner").mockImplementation(() => {});
    vi.spyOn(createAction as any, "succeedSpinner").mockImplementation(() => {});
    vi.spyOn(createAction as any, "failSpinner").mockImplementation(() => {});
    vi.spyOn(createAction as any, "createKeypair").mockResolvedValue("0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("successfully creates and saves an encrypted keystore", async () => {
    const options = {output: "keypair.json", overwrite: false};

    await createAction.execute(options);

    expect(createAction["startSpinner"]).toHaveBeenCalledWith("Creating encrypted keystore...");
    expect(createAction["createKeypair"]).toHaveBeenCalledWith(
      options.output,
      options.overwrite
    );
    expect(createAction["succeedSpinner"]).toHaveBeenCalledWith(
      "Account created and saved to: keypair.json",
    );
  });

  test("handles errors during keystore creation", async () => {
    const mockError = new Error("Mocked creation error");
    vi.spyOn(createAction as any, "createKeypair").mockRejectedValue(mockError);

    await createAction.execute({output: "keypair.json", overwrite: true});

    expect(createAction["failSpinner"]).toHaveBeenCalledWith("Failed to create account", mockError);
  });
});
