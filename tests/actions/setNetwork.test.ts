import {describe, test, vi, beforeEach, afterEach, expect} from "vitest";
import {NetworkActions} from "../../src/commands/network/setNetwork";
import {ConfigFileManager} from "../../src/lib/config/ConfigFileManager";
import inquirer from "inquirer";
import {localnet, studionet, testnetAsimov} from "genlayer-js/chains";

vi.mock("../../src/lib/config/ConfigFileManager");
vi.mock("inquirer");

describe("NetworkActions", () => {
  let networkActions: NetworkActions;

  beforeEach(() => {
    networkActions = new NetworkActions();
    vi.clearAllMocks();

    vi.spyOn(networkActions as any, "succeedSpinner").mockImplementation(() => {});
    vi.spyOn(networkActions as any, "failSpinner").mockImplementation(() => {});
    vi.spyOn(networkActions as any, "writeConfig").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("setNetwork method sets network by valid name", async () => {
    await networkActions.setNetwork(localnet.name);

    expect(networkActions["writeConfig"]).toHaveBeenCalledWith("network", "localnet");
    expect(networkActions["succeedSpinner"]).toHaveBeenCalledWith(
      `Network successfully set to ${localnet.name}`,
    );
  });

  test("setNetwork method sets network by valid alias", async () => {
    await networkActions.setNetwork("localnet");

    expect(networkActions["writeConfig"]).toHaveBeenCalledWith("network", "localnet");
    expect(networkActions["succeedSpinner"]).toHaveBeenCalledWith(
      `Network successfully set to ${localnet.name}`,
    );
  });

  test("setNetwork method sets studionet by name", async () => {
    await networkActions.setNetwork(studionet.name);

    expect(networkActions["writeConfig"]).toHaveBeenCalledWith("network", "studionet");
    expect(networkActions["succeedSpinner"]).toHaveBeenCalledWith(
      `Network successfully set to ${studionet.name}`,
    );
  });

  test("setNetwork method sets studionet by alias", async () => {
    await networkActions.setNetwork("studionet");

    expect(networkActions["writeConfig"]).toHaveBeenCalledWith("network", "studionet");
    expect(networkActions["succeedSpinner"]).toHaveBeenCalledWith(
      `Network successfully set to ${studionet.name}`,
    );
  });

  test("setNetwork method sets testnet-asimov by name", async () => {
    await networkActions.setNetwork(testnetAsimov.name);

    expect(networkActions["writeConfig"]).toHaveBeenCalledWith("network", "testnet-asimov");
    expect(networkActions["succeedSpinner"]).toHaveBeenCalledWith(
      `Network successfully set to ${testnetAsimov.name}`,
    );
  });

  test("setNetwork method sets testnet-asimov by alias", async () => {
    await networkActions.setNetwork("testnet-asimov");

    expect(networkActions["writeConfig"]).toHaveBeenCalledWith("network", "testnet-asimov");
    expect(networkActions["succeedSpinner"]).toHaveBeenCalledWith(
      `Network successfully set to ${testnetAsimov.name}`,
    );
  });

  test("setNetwork method fails for invalid network name", async () => {
    await networkActions.setNetwork("invalidNetwork");

    expect(networkActions["failSpinner"]).toHaveBeenCalledWith("Network invalidNetwork not found");
    expect(networkActions["writeConfig"]).not.toHaveBeenCalled();
    expect(networkActions["succeedSpinner"]).not.toHaveBeenCalled();
  });

  test("setNetwork method fails for empty network name", async () => {
    await networkActions.setNetwork("");

    expect(networkActions["failSpinner"]).toHaveBeenCalledWith("Network  not found");
    expect(networkActions["writeConfig"]).not.toHaveBeenCalled();
    expect(networkActions["succeedSpinner"]).not.toHaveBeenCalled();
  });

  test("setNetwork method prompts user when no network name provided", async () => {
    vi.mocked(inquirer.prompt).mockResolvedValue({
      selectedNetwork: "localnet",
    });

    await networkActions.setNetwork();

    expect(inquirer.prompt).toHaveBeenCalledWith([
      {
        type: "list",
        name: "selectedNetwork",
        message: "Select which network do you want to use:",
        choices: [
          {name: localnet.name, value: "localnet"},
          {name: studionet.name, value: "studionet"},
          {name: testnetAsimov.name, value: "testnet-asimov"},
        ],
      },
    ]);
    expect(networkActions["writeConfig"]).toHaveBeenCalledWith("network", "localnet");
    expect(networkActions["succeedSpinner"]).toHaveBeenCalledWith(
      `Network successfully set to ${localnet.name}`,
    );
  });

  test("setNetwork method handles interactive selection of studionet", async () => {
    vi.mocked(inquirer.prompt).mockResolvedValue({
      selectedNetwork: "studionet",
    });

    await networkActions.setNetwork();

    expect(networkActions["writeConfig"]).toHaveBeenCalledWith("network", "studionet");
    expect(networkActions["succeedSpinner"]).toHaveBeenCalledWith(
      `Network successfully set to ${studionet.name}`,
    );
  });

  test("setNetwork method handles interactive selection of testnet-asimov", async () => {
    vi.mocked(inquirer.prompt).mockResolvedValue({
      selectedNetwork: "testnet-asimov",
    });

    await networkActions.setNetwork();

    expect(networkActions["writeConfig"]).toHaveBeenCalledWith("network", "testnet-asimov");
    expect(networkActions["succeedSpinner"]).toHaveBeenCalledWith(
      `Network successfully set to ${testnetAsimov.name}`,
    );
  });

  test("setNetwork method handles case-sensitive network names", async () => {
    await networkActions.setNetwork("LOCALNET");

    expect(networkActions["failSpinner"]).toHaveBeenCalledWith("Network LOCALNET not found");
    expect(networkActions["writeConfig"]).not.toHaveBeenCalled();
  });

  test("setNetwork method handles partial network names", async () => {
    await networkActions.setNetwork("local");

    expect(networkActions["failSpinner"]).toHaveBeenCalledWith("Network local not found");
    expect(networkActions["writeConfig"]).not.toHaveBeenCalled();
  });
});
