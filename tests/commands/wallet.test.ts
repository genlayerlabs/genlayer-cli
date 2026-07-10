import {Command} from "commander";
import {vi, describe, beforeEach, afterEach, test, expect} from "vitest";
import {initializeWalletCommands} from "../../src/commands/wallet";
import {WalletAction} from "../../src/commands/wallet/WalletAction";

vi.mock("../../src/commands/wallet/WalletAction");

describe("wallet commands", () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    initializeWalletCommands(program);
    vi.clearAllMocks();
  });

  afterEach(() => vi.restoreAllMocks());

  test("connect passes --network and --rpc", async () => {
    program.parse([
      "node",
      "test",
      "wallet",
      "connect",
      "--network",
      "testnet-bradbury",
      "--rpc",
      "https://r",
    ]);
    expect(WalletAction.prototype.connect).toHaveBeenCalledWith(
      expect.objectContaining({network: "testnet-bradbury", rpc: "https://r"}),
    );
  });

  test("connect works with no flags", async () => {
    program.parse(["node", "test", "wallet", "connect"]);
    expect(WalletAction.prototype.connect).toHaveBeenCalledTimes(1);
  });

  test("status is dispatched", async () => {
    program.parse(["node", "test", "wallet", "status"]);
    expect(WalletAction.prototype.status).toHaveBeenCalledTimes(1);
  });

  test("disconnect is dispatched", async () => {
    program.parse(["node", "test", "wallet", "disconnect"]);
    expect(WalletAction.prototype.disconnect).toHaveBeenCalledTimes(1);
  });

  test("daemon subcommand exists (hidden) and dispatches", async () => {
    program.parse(["node", "test", "wallet", "daemon", "--network", "localnet"]);
    expect(WalletAction.prototype.daemon).toHaveBeenCalledWith(
      expect.objectContaining({network: "localnet"}),
    );
  });

  test("daemon is hidden from the wallet help/command listing", () => {
    const wallet = program.commands.find(c => c.name() === "wallet")!;
    const daemon = wallet.commands.find(c => c.name() === "daemon")!;
    // Present but hidden.
    expect(daemon).toBeDefined();
    expect((daemon as any)._hidden).toBe(true);
  });
});
