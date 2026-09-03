import {Command} from "commander";
import {vi, describe, beforeEach, afterEach, test, expect} from "vitest";
import {initializeNetworkCommands} from "../../src/commands/network";
import {NetworkActions} from "../../src/commands/network/setNetwork";

vi.mock("../../src/commands/network/setNetwork");

describe("network commands", () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    initializeNetworkCommands(program);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("NetworkActions.setNetwork is called with the correct network name", async () => {
    program.parse(["node", "test", "network", "set", "localnet"]);
    expect(NetworkActions).toHaveBeenCalledTimes(1);
    expect(NetworkActions.prototype.setNetwork).toHaveBeenCalledWith("localnet");
  });

  test("NetworkActions.setNetwork is called with testnet-asimov", async () => {
    program.parse(["node", "test", "network", "set", "testnet-asimov"]);
    expect(NetworkActions).toHaveBeenCalledTimes(1);
    expect(NetworkActions.prototype.setNetwork).toHaveBeenCalledWith("testnet-asimov");
  });

  test("NetworkActions.setNetwork is called with studionet", async () => {
    program.parse(["node", "test", "network", "set", "studionet"]);
    expect(NetworkActions).toHaveBeenCalledTimes(1);
    expect(NetworkActions.prototype.setNetwork).toHaveBeenCalledWith("studionet");
  });

  test("NetworkActions.setNetwork is called without a network name", async () => {
    program.parse(["node", "test", "network", "set"]);
    expect(NetworkActions).toHaveBeenCalledTimes(1);
    expect(NetworkActions.prototype.setNetwork).toHaveBeenCalledWith(undefined);
  });

  test("NetworkActions is instantiated when the command is executed", async () => {
    program.parse(["node", "test", "network", "set", "localnet"]);
    expect(NetworkActions).toHaveBeenCalledTimes(1);
  });

  test("NetworkActions.setNetwork is called without throwing errors for valid network", async () => {
    program.parse(["node", "test", "network", "set", "localnet"]);
    vi.mocked(NetworkActions.prototype.setNetwork).mockResolvedValue();
    expect(() => program.parse(["node", "test", "network", "set", "localnet"])).not.toThrow();
  });

  test("NetworkActions.showInfo is called for network info", async () => {
    program.parse(["node", "test", "network", "info"]);
    expect(NetworkActions).toHaveBeenCalledTimes(1);
    expect(NetworkActions.prototype.showInfo).toHaveBeenCalled();
  });

  test("NetworkActions.addNetwork is called with add options", async () => {
    program.parse([
      "node",
      "test",
      "network",
      "add",
      "bradbury-clarke",
      "--base",
      "testnet-bradbury",
      "--deployment",
      "/tmp/dep.json",
      "--deployment-key",
      "genlayerTestnet.deployment_x",
      "--rpc",
      "http://localhost:9999",
      "--consensus-main",
      "0x1111111111111111111111111111111111111111",
      "--consensus-data",
      "0x2222222222222222222222222222222222222222",
      "--staking",
      "0x3333333333333333333333333333333333333333",
      "--fee-manager",
      "0x4444444444444444444444444444444444444444",
      "--rounds-storage",
      "0x5555555555555555555555555555555555555555",
      "--appeals",
      "0x6666666666666666666666666666666666666666",
      "--chain-id",
      "4222",
    ]);

    expect(NetworkActions).toHaveBeenCalledTimes(1);
    expect(NetworkActions.prototype.addNetwork).toHaveBeenCalledWith(
      "bradbury-clarke",
      expect.objectContaining({
        base: "testnet-bradbury",
        deployment: "/tmp/dep.json",
        deploymentKey: "genlayerTestnet.deployment_x",
        rpc: "http://localhost:9999",
        consensusMain: "0x1111111111111111111111111111111111111111",
        consensusData: "0x2222222222222222222222222222222222222222",
        staking: "0x3333333333333333333333333333333333333333",
        feeManager: "0x4444444444444444444444444444444444444444",
        roundsStorage: "0x5555555555555555555555555555555555555555",
        appeals: "0x6666666666666666666666666666666666666666",
        chainId: "4222",
      }),
    );
  });

  test("NetworkActions.removeNetwork is called for network remove", async () => {
    program.parse(["node", "test", "network", "remove", "bradbury-clarke"]);
    expect(NetworkActions).toHaveBeenCalledTimes(1);
    expect(NetworkActions.prototype.removeNetwork).toHaveBeenCalledWith("bradbury-clarke");
  });
});
