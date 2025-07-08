import {describe, test, vi, beforeEach, afterEach, expect} from "vitest";
import {KeypairCreator} from "../../src/commands/keygen/create";

describe("KeypairCreator", () => {
  let keypairCreator: KeypairCreator;

  beforeEach(() => {
    vi.clearAllMocks();
    keypairCreator = new KeypairCreator();
    
    // Mock the BaseAction methods
    vi.spyOn(keypairCreator as any, "startSpinner").mockImplementation(() => {});
    vi.spyOn(keypairCreator as any, "succeedSpinner").mockImplementation(() => {});
    vi.spyOn(keypairCreator as any, "failSpinner").mockImplementation(() => {});
    vi.spyOn(keypairCreator as any, "createKeypair").mockResolvedValue("0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("successfully creates and saves an encrypted keystore", async () => {
    const options = {output: "keypair.json", overwrite: false};

    await keypairCreator.createKeypairAction(options);

    expect(keypairCreator["startSpinner"]).toHaveBeenCalledWith("Creating encrypted keystore...");
    expect(keypairCreator["createKeypair"]).toHaveBeenCalledWith(
      options.output, 
      options.overwrite
    );
    expect(keypairCreator["succeedSpinner"]).toHaveBeenCalledWith(
      "Encrypted keystore successfully created and saved to: keypair.json",
    );
  });

  test("handles errors during keystore creation", async () => {
    const mockError = new Error("Mocked creation error");
    vi.spyOn(keypairCreator as any, "createKeypair").mockRejectedValue(mockError);

    await keypairCreator.createKeypairAction({output: "keypair.json", overwrite: true});

    expect(keypairCreator["failSpinner"]).toHaveBeenCalledWith("Failed to generate keystore", mockError);
  });
});
