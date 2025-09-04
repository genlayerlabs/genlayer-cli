import { Command } from "commander";
import { vi, describe, beforeEach, afterEach, test, expect } from "vitest";
import { initializeKeygenCommands } from "../../src/commands/keygen";
import { KeypairCreator } from "../../src/commands/keygen/create";
import { UnlockAction } from "../../src/commands/keygen/unlock";
import { LockAction } from "../../src/commands/keygen/lock";

vi.mock("../../src/commands/keygen/create");
vi.mock("../../src/commands/keygen/unlock");
vi.mock("../../src/commands/keygen/lock");

describe("keygen create command", () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    initializeKeygenCommands(program);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("keypairCreator.createKeypairAction is called with default options", async () => {
    program.parse(["node", "test", "keygen", "create"]);
    expect(KeypairCreator).toHaveBeenCalledTimes(1);
    expect(KeypairCreator.prototype.createKeypairAction).toHaveBeenCalledWith({
      output: "./keypair.json",
      overwrite: false,
    });
  });

  test("keypairCreator.createKeypairAction is called with custom output option", async () => {
    program.parse(["node", "test", "keygen", "create", "--output", "./custom.json"]);
    expect(KeypairCreator).toHaveBeenCalledTimes(1);
    expect(KeypairCreator.prototype.createKeypairAction).toHaveBeenCalledWith({
      output: "./custom.json",
      overwrite: false,
    });
  });

  test("keypairCreator.createKeypairAction is called with overwrite enabled", async () => {
    program.parse(["node", "test", "keygen", "create", "--overwrite"]);
    expect(KeypairCreator).toHaveBeenCalledTimes(1);
    expect(KeypairCreator.prototype.createKeypairAction).toHaveBeenCalledWith({
      output: "./keypair.json",
      overwrite: true,
    });
  });

  test("keypairCreator.createKeypairAction is called with custom output and overwrite enabled", async () => {
    program.parse(["node", "test", "keygen", "create", "--output", "./custom.json", "--overwrite"]);
    expect(KeypairCreator).toHaveBeenCalledTimes(1);
    expect(KeypairCreator.prototype.createKeypairAction).toHaveBeenCalledWith({
      output: "./custom.json",
      overwrite: true,
    });
  });

  test("KeypairCreator is instantiated when the command is executed", async () => {
    program.parse(["node", "test", "keygen", "create"]);
    expect(KeypairCreator).toHaveBeenCalledTimes(1);
  });



  test("keypairCreator.createKeypairAction is called without throwing errors for default options", async () => {
    program.parse(["node", "test", "keygen", "create"]);
    vi.mocked(KeypairCreator.prototype.createKeypairAction).mockReturnValue();
    expect(() => program.parse(["node", "test", "keygen", "create"])).not.toThrow();
  });
});

describe("keygen unlock command", () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    initializeKeygenCommands(program);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("UnlockAction is instantiated and execute is called", async () => {
    program.parse(["node", "test", "keygen", "unlock"]);
    expect(UnlockAction).toHaveBeenCalledTimes(1);
    expect(UnlockAction.prototype.execute).toHaveBeenCalled();
  });

  test("UnlockAction.execute is called without throwing errors", async () => {
    vi.mocked(UnlockAction.prototype.execute).mockResolvedValue();
    expect(() => program.parse(["node", "test", "keygen", "unlock"])).not.toThrow();
  });
});

describe("keygen lock command", () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    initializeKeygenCommands(program);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("LockAction is instantiated and execute is called", async () => {
    program.parse(["node", "test", "keygen", "lock"]);
    expect(LockAction).toHaveBeenCalledTimes(1);
    expect(LockAction.prototype.execute).toHaveBeenCalled();
  });

  test("LockAction.execute is called without throwing errors", async () => {
    vi.mocked(LockAction.prototype.execute).mockResolvedValue();
    expect(() => program.parse(["node", "test", "keygen", "lock"])).not.toThrow();
  });
});
