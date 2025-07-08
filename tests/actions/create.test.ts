import {describe, test, vi, beforeEach, afterEach, expect} from "vitest";
import {KeypairCreator} from "../../src/commands/keygen/create";
import {writeFileSync, existsSync} from "fs";
import {ethers} from "ethers";

vi.mock("fs");

vi.mock("ethers", () => ({
  ethers: {
    Wallet: {
      createRandom: vi.fn(),
    },
  },
}));

describe("KeypairCreator", () => {
  let keypairCreator: KeypairCreator;

  const mockWallet: any = {
    address: "0xMockedAddress",
    privateKey: "0xMockedPrivateKey",
  };

  const mockKeypairManager = {
    createKeypair: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    keypairCreator = new KeypairCreator();
    (keypairCreator as any).keypairManager = mockKeypairManager;
    vi.spyOn(keypairCreator as any, "startSpinner").mockImplementation(() => {});
    vi.spyOn(keypairCreator as any, "succeedSpinner").mockImplementation(() => {});
    vi.spyOn(keypairCreator as any, "failSpinner").mockImplementation(() => {});
    vi.spyOn(keypairCreator as any, "writeConfig").mockImplementation(() => {});
    vi.spyOn(keypairCreator as any, "getFilePath").mockImplementation(fileName => `/mocked/path/${fileName}`);
    vi.mocked(ethers.Wallet.createRandom).mockReturnValue(mockWallet);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("successfully creates and saves a keypair", () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const options = {output: "keypair.json", overwrite: false};

    keypairCreator.createKeypairAction(options);

    expect(keypairCreator["startSpinner"]).toHaveBeenCalledWith("Creating keypair...");
    expect(mockKeypairManager.createKeypair).toHaveBeenCalledWith(options.output, options.overwrite);
    expect(keypairCreator["succeedSpinner"]).toHaveBeenCalledWith(
      "Keypair successfully created and saved to: keypair.json",
    );
  });

  test("handles errors during keypair creation", () => {
    const mockError = new Error("Mocked creation error");
    mockKeypairManager.createKeypair.mockImplementation(() => {
      throw mockError;
    });

    keypairCreator.createKeypairAction({output: "keypair.json", overwrite: true});

    expect(keypairCreator["failSpinner"]).toHaveBeenCalledWith("Failed to generate keypair", mockError);
  });
});
