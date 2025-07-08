import { describe, test, vi, beforeEach, afterEach, expect, Mock } from "vitest";
import { OllamaAction } from "../../src/commands/update/ollama";
import { rpcClient } from "../../src/lib/clients/jsonRpcClient";
import Docker from "dockerode";

vi.mock("dockerode");
vi.mock("../../src/lib/clients/jsonRpcClient");

describe("OllamaAction", () => {
  let ollamaAction: OllamaAction;
  let mockGetContainer: Mock;
  let mockExec: Mock;
  let mockStart: Mock;
  let mockStream: any;

  beforeEach(() => {
    vi.clearAllMocks();
    ollamaAction = new OllamaAction();

    mockGetContainer = vi.mocked(Docker.prototype.getContainer);
    mockExec = vi.fn();
    mockStart = vi.fn();

    mockStream = {
      on: vi.fn(),
    };

    mockExec.mockResolvedValue({
      start: mockStart,
    });

    mockStart.mockResolvedValue(mockStream);

    mockGetContainer.mockReturnValue({
      exec: mockExec,
    } as unknown as Docker.Container);

    Docker.prototype.getContainer = mockGetContainer;

    vi.spyOn(ollamaAction as any, "startSpinner").mockImplementation(() => {});
    vi.spyOn(ollamaAction as any, "setSpinnerText").mockImplementation(() => {});
    vi.spyOn(ollamaAction as any, "succeedSpinner").mockImplementation(() => {});
    vi.spyOn(ollamaAction as any, "failSpinner").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("should update the model using 'pull'", async () => {
    const mockProvider = {
      plugin: "ollama",
      config: { key: "value" },
      plugin_config: { pluginKey: "pluginValue" },
    };

    vi.mocked(rpcClient.request).mockResolvedValueOnce({
      result: [mockProvider],
    });

    mockStream.on.mockImplementation((event: any, callback: any) => {
      if (event === "data") {
        callback(Buffer.from("Mocked output success"));
      }
      if (event === "end") {
        callback();
      }
    });

    await ollamaAction.updateModel("mocked_model");

    expect(ollamaAction["startSpinner"]).toHaveBeenCalledWith(`Updating model "mocked_model"...`);
    expect(mockGetContainer).toHaveBeenCalledWith("genlayer-ollama");
    expect(mockExec).toHaveBeenCalledWith({
      Cmd: ["ollama", "pull", "mocked_model"],
      AttachStdout: true,
      AttachStderr: true,
    });
    expect(mockStart).toHaveBeenCalledWith({ Detach: false, Tty: false });
    expect(ollamaAction["setSpinnerText"]).toHaveBeenCalledWith("Mocked output success");
    expect(ollamaAction["succeedSpinner"]).toHaveBeenCalledWith(`Model "mocked_model" updated successfully`);
  });

  test("should remove the model using 'rm'", async () => {
    mockStream.on.mockImplementation((event: any, callback: any) => {
      if (event === "data") {
        callback(Buffer.from("Mocked output success"));
      }
      if (event === "end") {
        callback();
      }
    });

    await ollamaAction.removeModel("mocked_model");

    expect(ollamaAction["startSpinner"]).toHaveBeenCalledWith(`Executing 'rm' command on model "mocked_model"...`);
    expect(mockGetContainer).toHaveBeenCalledWith("genlayer-ollama");
    expect(mockExec).toHaveBeenCalledWith({
      Cmd: ["ollama", "rm", "mocked_model"],
      AttachStdout: true,
      AttachStderr: true,
    });
    expect(mockStart).toHaveBeenCalledWith({ Detach: false, Tty: false });
    expect(ollamaAction["setSpinnerText"]).toHaveBeenCalledWith("Mocked output success");
    expect(ollamaAction["succeedSpinner"]).toHaveBeenCalledWith(`Model "mocked_model" removed successfully`);
  });

  test("should log an error if an exception occurs during 'pull'", async () => {
    const mockProvider = {
      plugin: "ollama",
      config: { key: "value" },
      plugin_config: { pluginKey: "pluginValue" },
    };

    vi.mocked(rpcClient.request).mockResolvedValueOnce({
      result: [mockProvider],
    });

    const error = new Error("Mocked error");
    mockExec.mockRejectedValue(error);

    await ollamaAction.updateModel("mocked_model");

    expect(ollamaAction["failSpinner"]).toHaveBeenCalledWith(`Error executing command "pull" on model "mocked_model"`, error);
  });

  test("should log an error if an exception occurs during 'rm'", async () => {
    const error = new Error("Mocked error");
    mockExec.mockRejectedValue(error);

    await ollamaAction.removeModel("mocked_model");

    expect(ollamaAction["failSpinner"]).toHaveBeenCalledWith(`Error executing command "rm" on model "mocked_model"`, error);
  });

  test("should throw an error if no 'ollama' provider exists during updateModel", async () => {
    vi.mocked(rpcClient.request).mockResolvedValueOnce({
      result: [],
    });

    await ollamaAction.updateModel("mocked_model");

    expect(ollamaAction["failSpinner"]).toHaveBeenCalledWith(
      "No existing 'ollama' provider found. Unable to add/update a model."
    );
  });

  test("should reject with an error if success is not set to true", async () => {
    const mockProvider = {
      plugin: "ollama",
      config: { key: "value" },
      plugin_config: { pluginKey: "pluginValue" },
    };

    vi.mocked(rpcClient.request).mockResolvedValueOnce({
      result: [mockProvider],
    });

    mockStream.on.mockImplementation((event: any, callback: any) => {
      if (event === "data") {
        callback(Buffer.from("Mocked output failure"));
      }
      if (event === "end") {
        callback();
      }
    });

    await ollamaAction.updateModel("mocked_model");

    expect(ollamaAction["failSpinner"]).toHaveBeenCalledWith(
      `Failed to execute 'pull' on model "mocked_model".`
    );
  });

  test("should log an error if an exception occurs inside updateModel", async () => {
    const mockError = new Error("Mocked error");

    vi.mocked(rpcClient.request).mockRejectedValue(mockError);

    await ollamaAction.updateModel("mocked_model");

    expect(ollamaAction["failSpinner"]).toHaveBeenCalledWith(`Error updating model "mocked_model"`, mockError);
  });

  test("should call get config if modelName is empty", async () => {
    const defaultModel = "default_model";
    vi.spyOn(ollamaAction as any, "getConfig").mockReturnValue({ defaultOllamaModel: defaultModel });

    await ollamaAction.updateModel("");
    expect(ollamaAction.getConfig).toHaveBeenCalledTimes(1);
  });

});