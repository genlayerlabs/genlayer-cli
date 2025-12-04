import { Command } from "commander";
import { vi, describe, beforeEach, afterEach, test, expect } from "vitest";
import { initializeAccountCommands } from "../../src/commands/account";
import { CreateAccountAction } from "../../src/commands/account/create";
import { UnlockAccountAction } from "../../src/commands/account/unlock";
import { LockAccountAction } from "../../src/commands/account/lock";

vi.mock("../../src/commands/account/create");
vi.mock("../../src/commands/account/unlock");
vi.mock("../../src/commands/account/lock");
vi.mock("../../src/commands/account/show");
vi.mock("../../src/commands/account/import");
vi.mock("../../src/commands/account/send");
vi.mock("../../src/commands/account/list");
vi.mock("../../src/commands/account/use");
vi.mock("../../src/commands/account/remove");

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

  test("CreateAccountAction.execute is called with name option", async () => {
    program.parse(["node", "test", "account", "create", "--name", "main"]);
    expect(CreateAccountAction).toHaveBeenCalledTimes(1);
    expect(CreateAccountAction.prototype.execute).toHaveBeenCalledWith({
      name: "main",
      overwrite: false,
      setActive: true,
    });
  });

  test("CreateAccountAction.execute is called with custom name option", async () => {
    program.parse(["node", "test", "account", "create", "--name", "validator"]);
    expect(CreateAccountAction).toHaveBeenCalledTimes(1);
    expect(CreateAccountAction.prototype.execute).toHaveBeenCalledWith({
      name: "validator",
      overwrite: false,
      setActive: true,
    });
  });

  test("CreateAccountAction.execute is called with overwrite enabled", async () => {
    program.parse(["node", "test", "account", "create", "--name", "main", "--overwrite"]);
    expect(CreateAccountAction).toHaveBeenCalledTimes(1);
    expect(CreateAccountAction.prototype.execute).toHaveBeenCalledWith({
      name: "main",
      overwrite: true,
      setActive: true,
    });
  });

  test("CreateAccountAction.execute is called with no-set-active option", async () => {
    program.parse(["node", "test", "account", "create", "--name", "operator", "--no-set-active"]);
    expect(CreateAccountAction).toHaveBeenCalledTimes(1);
    expect(CreateAccountAction.prototype.execute).toHaveBeenCalledWith({
      name: "operator",
      overwrite: false,
      setActive: false,
    });
  });

  test("CreateAccountAction is instantiated when the command is executed", async () => {
    program.parse(["node", "test", "account", "create", "--name", "main"]);
    expect(CreateAccountAction).toHaveBeenCalledTimes(1);
  });

  test("CreateAccountAction.execute is called without throwing errors", async () => {
    vi.mocked(CreateAccountAction.prototype.execute).mockReturnValue(Promise.resolve());
    expect(() => program.parse(["node", "test", "account", "create", "--name", "main"])).not.toThrow();
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
    expect(UnlockAccountAction.prototype.execute).toHaveBeenCalledWith({});
  });

  test("UnlockAccountAction.execute is called with account option", async () => {
    program.parse(["node", "test", "account", "unlock", "--account", "validator"]);
    expect(UnlockAccountAction).toHaveBeenCalledTimes(1);
    expect(UnlockAccountAction.prototype.execute).toHaveBeenCalledWith({
      account: "validator",
    });
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
    expect(LockAccountAction.prototype.execute).toHaveBeenCalledWith({});
  });

  test("LockAccountAction.execute is called with account option", async () => {
    program.parse(["node", "test", "account", "lock", "--account", "validator"]);
    expect(LockAccountAction).toHaveBeenCalledTimes(1);
    expect(LockAccountAction.prototype.execute).toHaveBeenCalledWith({
      account: "validator",
    });
  });

  test("LockAccountAction.execute is called without throwing errors", async () => {
    vi.mocked(LockAccountAction.prototype.execute).mockResolvedValue();
    expect(() => program.parse(["node", "test", "account", "lock"])).not.toThrow();
  });
});
