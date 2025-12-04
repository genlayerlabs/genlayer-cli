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
});
