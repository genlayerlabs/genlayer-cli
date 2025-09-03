import { Command } from "commander";
import { vi, describe, beforeEach, afterEach, test, expect } from "vitest";
import { initializeValidatorCommands } from "../../src/commands/localnet";
import { ValidatorsAction } from "../../src/commands/localnet/validators";

vi.mock("../../src/commands/localnet/validators");

describe("localnet validator command", () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    initializeValidatorCommands(program);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("ValidatorsAction.getValidator is called with address option", async () => {
    program.parse(["node", "test", "localnet", "validators", "get", "--address", "mocked_address"]);
    expect(ValidatorsAction).toHaveBeenCalledTimes(1);
    expect(ValidatorsAction.prototype.getValidator).toHaveBeenCalledWith({
      address: "mocked_address",
    });
  });

  test("ValidatorsAction.getValidator is called without address option", async () => {
    program.parse(["node", "test", "localnet", "validators", "get"]);
    expect(ValidatorsAction).toHaveBeenCalledTimes(1);
    expect(ValidatorsAction.prototype.getValidator).toHaveBeenCalledWith({});
  });

  test("ValidatorsAction.deleteValidator is called with address option", async () => {
    program.parse(["node", "test", "localnet", "validators", "delete", "--address", "mocked_address"]);
    expect(ValidatorsAction).toHaveBeenCalledTimes(1);
    expect(ValidatorsAction.prototype.deleteValidator).toHaveBeenCalledWith({
      address: "mocked_address",
    });
  });

  test("ValidatorsAction.deleteValidator is called without address option", async () => {
    program.parse(["node", "test", "localnet", "validators", "delete"]);
    expect(ValidatorsAction).toHaveBeenCalledTimes(1);
    expect(ValidatorsAction.prototype.deleteValidator).toHaveBeenCalledWith({});
  });

  test("ValidatorsAction.countValidators is called", async () => {
    program.parse(["node", "test", "localnet", "validators", "count"]);
    expect(ValidatorsAction).toHaveBeenCalledTimes(1);
    expect(ValidatorsAction.prototype.countValidators).toHaveBeenCalled();
  });

  test("ValidatorsAction.updateValidator is called with all options", async () => {
    program.parse([
      "node",
      "test",
      "localnet",
      "validators",
      "update",
      "mocked_address",
      "--stake",
      "10",
      "--provider",
      "mocked_provider",
      "--model",
      "mocked_model",
      '--config',
      '{"max_tokens":500}',
    ]);
    expect(ValidatorsAction).toHaveBeenCalledTimes(1);
    expect(ValidatorsAction.prototype.updateValidator).toHaveBeenCalledWith({
      address: "mocked_address",
      stake: "10",
      provider: "mocked_provider",
      model: "mocked_model",
      config: '{"max_tokens":500}',
    });
  });

  test("ValidatorsAction.createRandomValidators is called with count and providers", async () => {
    program.parse([
      "node",
      "test",
      "localnet",
      "validators",
      "create-random",
      "--count",
      "3",
      "--providers",
      "provider1",
      "provider2",
    ]);
    expect(ValidatorsAction).toHaveBeenCalledTimes(1);
    expect(ValidatorsAction.prototype.createRandomValidators).toHaveBeenCalledWith({
      count: "3",
      providers: ["provider1", "provider2"],
      models: []
    });
  });

  test("ValidatorsAction.createValidator is called with default stake", async () => {
    program.parse(["node", "test", "localnet", "validators", "create"]);
    expect(ValidatorsAction).toHaveBeenCalledTimes(1);
    expect(ValidatorsAction.prototype.createValidator).toHaveBeenCalledWith({
      stake: "1",
      config: undefined,
    });
  });

  test("ValidatorsAction.createValidator is called with stake and config", async () => {
    program.parse([
      "node",
      "test",
      "localnet",
      "validators",
      "create",
      "--stake",
      "5",
      '--config',
      '{"temperature":0.8}',
    ]);
    expect(ValidatorsAction).toHaveBeenCalledTimes(1);
    expect(ValidatorsAction.prototype.createValidator).toHaveBeenCalledWith({
      stake: "5",
      config: '{"temperature":0.8}',
    });
  });
});


