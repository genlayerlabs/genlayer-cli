import { Command } from "commander";
import { vi, describe, beforeEach, afterEach, test, expect } from "vitest";
import { initializeAccountCommands } from "../../src/commands/account";
import { CreateAccountAction } from "../../src/commands/account/create";
import { UnlockAccountAction } from "../../src/commands/account/unlock";
import { LockAccountAction } from "../../src/commands/account/lock";

vi.mock("../../src/commands/account/create");
vi.mock("../../src/commands/account/unlock");
vi.mock("../../src/commands/account/lock");

describe("account create command", () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    initializeAccountCommands(program);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("CreateAccountAction.execute is called with default options", async () => {
    program.parse(["node", "test", "account", "create"]);
    expect(CreateAccountAction).toHaveBeenCalledTimes(1);
    expect(CreateAccountAction.prototype.execute).toHaveBeenCalledWith({
      output: "./keypair.json",
      overwrite: false,
    });
  });

  test("CreateAccountAction.execute is called with custom output option", async () => {
    program.parse(["node", "test", "account", "create", "--output", "./custom.json"]);
    expect(CreateAccountAction).toHaveBeenCalledTimes(1);
    expect(CreateAccountAction.prototype.execute).toHaveBeenCalledWith({
      output: "./custom.json",
      overwrite: false,
    });
  });

  test("CreateAccountAction.execute is called with overwrite enabled", async () => {
    program.parse(["node", "test", "account", "create", "--overwrite"]);
    expect(CreateAccountAction).toHaveBeenCalledTimes(1);
    expect(CreateAccountAction.prototype.execute).toHaveBeenCalledWith({
      output: "./keypair.json",
      overwrite: true,
    });
  });

  test("CreateAccountAction.execute is called with custom output and overwrite enabled", async () => {
    program.parse(["node", "test", "account", "create", "--output", "./custom.json", "--overwrite"]);
    expect(CreateAccountAction).toHaveBeenCalledTimes(1);
    expect(CreateAccountAction.prototype.execute).toHaveBeenCalledWith({
      output: "./custom.json",
      overwrite: true,
    });
  });

  test("CreateAccountAction is instantiated when the command is executed", async () => {
    program.parse(["node", "test", "account", "create"]);
    expect(CreateAccountAction).toHaveBeenCalledTimes(1);
  });

  test("CreateAccountAction.execute is called without throwing errors for default options", async () => {
    program.parse(["node", "test", "account", "create"]);
    vi.mocked(CreateAccountAction.prototype.execute).mockReturnValue(Promise.resolve());
    expect(() => program.parse(["node", "test", "account", "create"])).not.toThrow();
  });
});

describe("account unlock command", () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    initializeAccountCommands(program);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("UnlockAccountAction is instantiated and execute is called", async () => {
    program.parse(["node", "test", "account", "unlock"]);
    expect(UnlockAccountAction).toHaveBeenCalledTimes(1);
    expect(UnlockAccountAction.prototype.execute).toHaveBeenCalled();
  });

  test("UnlockAccountAction.execute is called without throwing errors", async () => {
    vi.mocked(UnlockAccountAction.prototype.execute).mockResolvedValue();
    expect(() => program.parse(["node", "test", "account", "unlock"])).not.toThrow();
  });
});

describe("account lock command", () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    initializeAccountCommands(program);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("LockAccountAction is instantiated and execute is called", async () => {
    program.parse(["node", "test", "account", "lock"]);
    expect(LockAccountAction).toHaveBeenCalledTimes(1);
    expect(LockAccountAction.prototype.execute).toHaveBeenCalled();
  });

  test("LockAccountAction.execute is called without throwing errors", async () => {
    vi.mocked(LockAccountAction.prototype.execute).mockResolvedValue();
    expect(() => program.parse(["node", "test", "account", "lock"])).not.toThrow();
  });
});
