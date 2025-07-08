import { Command } from "commander";
import { vi, describe, beforeEach, afterEach, test, expect } from "vitest";
import { initializeGeneralCommands } from "../../src/commands/general";
import { getCommand, getCommandOption } from "../utils";
import { StartAction } from "../../src/commands/general/start";

vi.mock("../../src/commands/general/start");

describe("up command", () => {
  let upCommand: Command;
  let program: Command;

  beforeEach(() => {
    program = new Command();
    initializeGeneralCommands(program);

    upCommand = getCommand(program, "up");
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("doesn't require arguments or options", async () => {
    expect(() => program.parse(["node", "test", "up"])).not.toThrow();
    expect(StartAction).toHaveBeenCalledTimes(1);
    expect(StartAction.prototype.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        resetValidators: false,
        numValidators: "5",
        headless: false,
        resetDb: false,
        ollama: false,
      })
    );
  });

  test("option --reset-validators is accepted", async () => {
    expect(() => program.parse(["node", "test", "up", "--reset-validators"])).not.toThrow();
  });

  test("option --reset-validators default value is false", async () => {
    const resetValidatorsOption = getCommandOption(upCommand, "--reset-validators");
    expect(resetValidatorsOption?.defaultValue).toBe(false);
  });

  test("option --numValidators is accepted", async () => {
    expect(() => program.parse(["node", "test", "up", "--numValidators", "10"])).not.toThrow();
  });

  test("option --numValidators default value is 5", async () => {
    const numValidatorsOption = getCommandOption(upCommand, "--numValidators");
    expect(numValidatorsOption?.defaultValue).toBe("5");
  });

  test("unrecognized option is not accepted", async () => {
    upCommand?.exitOverride();
    expect(() => program.parse(["node", "test", "up", "-unknown"])).toThrowError(
      "error: unknown option '-unknown'"
    );
    expect(() => program.parse(["node", "test", "up", "--unknownOption"])).toThrowError(
      "error: unknown option '--unknownOption'"
    );
  });

  test("action is called with default options", async () => {
    program.parse(["node", "test", "up"]);
    expect(StartAction).toHaveBeenCalledTimes(1);
    expect(StartAction.prototype.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        resetValidators: false,
        numValidators: "5",
        headless: false,
        resetDb: false,
        ollama: false,
      })
    );
  });

  test("action is called with custom options", async () => {
    program.parse([
      "node",
      "test",
      "up",
      "--reset-validators",
      "--numValidators",
      "10",
      "--headless",
      "--reset-db",
      "--ollama",
    ]);

    expect(StartAction).toHaveBeenCalledTimes(1);
    expect(StartAction.prototype.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        resetValidators: true,
        numValidators: "10",
        headless: true,
        resetDb: true,
        ollama: true,
      })
    );
  });
});
