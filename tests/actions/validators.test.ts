import { describe, test, vi, beforeEach, afterEach, expect } from "vitest";
import { ValidatorsAction } from "../../src/commands/localnet/validators";
import { rpcClient } from "../../src/lib/clients/jsonRpcClient";
import inquirer from "inquirer";

vi.mock("../../src/lib/clients/jsonRpcClient", () => ({
  rpcClient: {
    request: vi.fn(),
  },
}));

vi.mock("inquirer");

describe("ValidatorsAction", () => {
  let validatorsAction: ValidatorsAction;

  beforeEach(() => {
    vi.clearAllMocks();
    validatorsAction = new ValidatorsAction();

    vi.spyOn(validatorsAction as any, "logSuccess").mockImplementation(() => {});
    vi.spyOn(validatorsAction as any, "logError").mockImplementation(() => {});
    vi.spyOn(validatorsAction as any, "startSpinner").mockImplementation(() => {});
    vi.spyOn(validatorsAction as any, "succeedSpinner").mockImplementation(() => {});
    vi.spyOn(validatorsAction as any, "failSpinner").mockImplementation(() => {});
    vi.spyOn(validatorsAction as any, "log").mockImplementation(() => {});
    vi.spyOn(validatorsAction as any, "stopSpinner").mockImplementation(() => {});
    vi.spyOn(validatorsAction as any, "setSpinnerText").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getValidator", () => {
    test("should fetch a specific validator by address", async () => {
      const mockAddress = "mocked_address";
      const mockResponse = { result: { id: 1, name: "Validator1" } };
      vi.mocked(rpcClient.request).mockResolvedValue(mockResponse);

      await validatorsAction.getValidator({ address: mockAddress });

      expect(validatorsAction["startSpinner"]).toHaveBeenCalledWith(
        `Fetching validator with address: ${mockAddress}`
      );

      expect(rpcClient.request).toHaveBeenCalledWith({
        method: "sim_getValidator",
        params: [mockAddress],
      });

      expect(validatorsAction["succeedSpinner"]).toHaveBeenCalledWith(
        `Successfully fetched validator with address: ${mockAddress}`,
        mockResponse.result
      );

      expect(validatorsAction["failSpinner"]).not.toHaveBeenCalled();
    });

    test("should fetch all validators when no address is provided", async () => {
      const mockResponse = { result: [{ id: 1 }, { id: 2 }] };
      vi.mocked(rpcClient.request).mockResolvedValue(mockResponse);

      await validatorsAction.getValidator({});

      expect(validatorsAction["startSpinner"]).toHaveBeenCalledWith("Fetching all validators...");

      expect(rpcClient.request).toHaveBeenCalledWith({
        method: "sim_getAllValidators",
        params: [],
      });

      expect(validatorsAction["succeedSpinner"]).toHaveBeenCalledWith(
        "Successfully fetched all validators.",
        mockResponse.result
      );

      expect(validatorsAction["failSpinner"]).not.toHaveBeenCalled();
    });

    test("should log an error if an exception occurs while fetching a specific validator", async () => {
      const mockAddress = "mocked_address";
      const mockError = new Error("Unexpected error");

      vi.mocked(rpcClient.request).mockRejectedValue(mockError);

      await validatorsAction.getValidator({ address: mockAddress });

      expect(validatorsAction["startSpinner"]).toHaveBeenCalledWith(
        `Fetching validator with address: ${mockAddress}`
      );

      expect(rpcClient.request).toHaveBeenCalledWith({
        method: "sim_getValidator",
        params: [mockAddress],
      });

      expect(validatorsAction["failSpinner"]).toHaveBeenCalledWith("Error fetching validators", mockError);
      expect(validatorsAction["succeedSpinner"]).not.toHaveBeenCalled();
    });

    test("should log an error if an exception occurs while fetching all validators", async () => {
      const mockError = new Error("Unexpected error");

      vi.mocked(rpcClient.request).mockRejectedValue(mockError);

      await validatorsAction.getValidator({});

      expect(validatorsAction["startSpinner"]).toHaveBeenCalledWith("Fetching all validators...");

      expect(rpcClient.request).toHaveBeenCalledWith({
        method: "sim_getAllValidators",
        params: [],
      });

      expect(validatorsAction["failSpinner"]).toHaveBeenCalledWith("Error fetching validators", mockError);
      expect(validatorsAction["succeedSpinner"]).not.toHaveBeenCalled();
    });
  });

  describe("deleteValidator", () => {
    test("should delete a specific validator", async () =>  {
      const mockAddress = "0x725a9D2D572E8833059a3e9a844791aF185C5Ff4";
      vi.mocked(inquirer.prompt).mockResolvedValue({ confirmAction: true });
      vi.mocked(rpcClient.request).mockResolvedValue({ result: mockAddress });

      await validatorsAction.deleteValidator({ address: mockAddress });

      expect(validatorsAction["startSpinner"]).toHaveBeenCalledWith(
        `Deleting validator with address: ${mockAddress}`
      );

      expect(rpcClient.request).toHaveBeenCalledWith({
        method: "sim_deleteValidator",
        params: [mockAddress],
      });

      expect(validatorsAction["succeedSpinner"]).toHaveBeenCalledWith(
        `Deleted Address: ${mockAddress}`
      );

      expect(validatorsAction["failSpinner"]).not.toHaveBeenCalled();
    });

    test("should delete all validators when no address is provided", async () => {
      vi.mocked(inquirer.prompt).mockResolvedValue({ confirmAction: true });
      vi.mocked(rpcClient.request).mockResolvedValue({});

      await validatorsAction.deleteValidator({});

      expect(validatorsAction["startSpinner"]).toHaveBeenCalledWith(
        "Deleting all validators..."
      );

      expect(rpcClient.request).toHaveBeenCalledWith({
        method: "sim_deleteAllValidators",
        params: [],
      });

      expect(validatorsAction["succeedSpinner"]).toHaveBeenCalledWith(
        "Successfully deleted all validators"
      );

      expect(validatorsAction["failSpinner"]).not.toHaveBeenCalled();
    });

    test("should abort deletion if user declines confirmation", async () => {
      vi.mocked(inquirer.prompt).mockResolvedValue({ confirmAction: false });

      await validatorsAction.deleteValidator({ address: "mocked_address" });

      expect(inquirer.prompt).toHaveBeenCalled();
      expect(validatorsAction["logError"]).toHaveBeenCalledWith("Operation aborted!");
      expect(rpcClient.request).not.toHaveBeenCalled();
      expect(validatorsAction["startSpinner"]).not.toHaveBeenCalled();
      expect(validatorsAction["succeedSpinner"]).not.toHaveBeenCalled();
    });

  });

  describe("countValidators", () => {
    test("should count all validators", async () => {
      const mockResponse = { result: 42 };
      vi.mocked(rpcClient.request).mockResolvedValue(mockResponse);

      await validatorsAction.countValidators();

      expect(validatorsAction["startSpinner"]).toHaveBeenCalledWith("Counting all validators...");

      expect(rpcClient.request).toHaveBeenCalledWith({
        method: "sim_countValidators",
        params: [],
      });

      expect(validatorsAction["succeedSpinner"]).toHaveBeenCalledWith("Total Validators: 42");
      expect(validatorsAction["failSpinner"]).not.toHaveBeenCalled();
    });

    test("should log an error if an exception occurs while counting validators", async () => {
      const mockError = new Error("Unexpected error");

      vi.mocked(rpcClient.request).mockRejectedValue(mockError);

      await validatorsAction.countValidators();

      expect(validatorsAction["startSpinner"]).toHaveBeenCalledWith("Counting all validators...");

      expect(rpcClient.request).toHaveBeenCalledWith({
        method: "sim_countValidators",
        params: [],
      });

      expect(validatorsAction["failSpinner"]).toHaveBeenCalledWith("Error counting validators", mockError);
      expect(validatorsAction["succeedSpinner"]).not.toHaveBeenCalled();
    });

  });

  describe("createValidator", () => {
    test("should create a validator with selected provider and model", async () => {
      const mockProvidersAndModels = [
        {
          provider: "Provider1",
          is_available: true,
          is_model_available: true,
          model: "Model1",
          config: { max_tokens: 500 },
          plugin: "Plugin1",
          plugin_config: { api_key_env_var: "KEY1" },
        },
      ];
      const mockResponse = { result: { id: 123 } };

      vi.mocked(rpcClient.request)
        .mockResolvedValueOnce({ result: mockProvidersAndModels })
        .mockResolvedValueOnce(mockResponse);

      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ selectedProvider: "Provider1" })
        .mockResolvedValueOnce({ selectedModel: "Model1" });

      await validatorsAction.createValidator({ stake: "10" });

      expect(validatorsAction["startSpinner"]).toHaveBeenCalledWith("Fetching available providers and models...");

      expect(rpcClient.request).toHaveBeenCalledWith({
        method: "sim_getProvidersAndModels",
        params: [],
      });

      expect(validatorsAction["stopSpinner"]).toHaveBeenCalled();

      expect(inquirer.prompt).toHaveBeenCalledWith([
        {
          type: "list",
          name: "selectedProvider",
          message: "Select a provider:",
          choices: ["Provider1"],
        },
      ]);

      expect(inquirer.prompt).toHaveBeenCalledWith([
        {
          type: "list",
          name: "selectedModel",
          message: "Select a model:",
          choices: ["Model1"],
        },
      ]);

      expect(validatorsAction["startSpinner"]).toHaveBeenCalledWith("Creating validator...");

      expect(rpcClient.request).toHaveBeenCalledWith({
        method: "sim_createValidator",
        params: [
          10,
          "Provider1",
          "Model1",
          { max_tokens: 500 },
          "Plugin1",
          { api_key_env_var: "KEY1" },
        ],
      });

      expect(validatorsAction["succeedSpinner"]).toHaveBeenCalledWith(
        "Validator successfully created:",
        mockResponse.result
      );

      expect(validatorsAction["failSpinner"]).not.toHaveBeenCalled();
    });

    test("should log an error for invalid stake", async () => {

      await validatorsAction.createValidator({ stake: "invalid" });

      expect(validatorsAction["logError"]).toHaveBeenCalledWith(
        "Invalid stake. Please provide a positive integer."
      );

      expect(rpcClient.request).not.toHaveBeenCalled();
      expect(validatorsAction["startSpinner"]).not.toHaveBeenCalled();
      expect(validatorsAction["failSpinner"]).not.toHaveBeenCalled();
    });

    test("should log an error if no providers or models are available", async () => {
      vi.mocked(rpcClient.request).mockResolvedValueOnce({ result: [] });

      await validatorsAction.createValidator({ stake: "10" });

      expect(validatorsAction["startSpinner"]).toHaveBeenCalledWith("Fetching available providers and models...");

      expect(rpcClient.request).toHaveBeenCalledWith({
        method: "sim_getProvidersAndModels",
        params: [],
      });

      expect(validatorsAction["stopSpinner"]).toHaveBeenCalled();

      expect(validatorsAction["logError"]).toHaveBeenCalledWith("No providers or models available.");

      expect(validatorsAction["failSpinner"]).not.toHaveBeenCalled();
      expect(validatorsAction["succeedSpinner"]).not.toHaveBeenCalled();
    });

    test("should log an error if no models are available for the selected provider", async () => {
      const mockProvidersAndModels = [
        { provider: "Provider1", is_available: true, is_model_available: false },
      ];

      vi.mocked(rpcClient.request).mockResolvedValueOnce({ result: mockProvidersAndModels });
      vi.mocked(inquirer.prompt).mockResolvedValueOnce({ selectedProvider: "Provider1" });

      await validatorsAction.createValidator({ stake: "10" });

      expect(validatorsAction["startSpinner"]).toHaveBeenCalledWith("Fetching available providers and models...");

      expect(validatorsAction["stopSpinner"]).toHaveBeenCalled();

      expect(inquirer.prompt).toHaveBeenCalledWith([
        {
          type: "list",
          name: "selectedProvider",
          message: "Select a provider:",
          choices: ["Provider1"],
        },
      ]);

      expect(validatorsAction["logError"]).toHaveBeenCalledWith("No models available for the selected provider.");
    });

    test("should log an error if selected model details are not found", async () => {
      const mockProvidersAndModels = [
        {
          provider: "Provider1",
          is_available: true,
          is_model_available: true,
          model: "Model1",
        },
      ];

      vi.mocked(rpcClient.request).mockResolvedValueOnce({ result: mockProvidersAndModels });
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ selectedProvider: "Provider1" })
        .mockResolvedValueOnce({ selectedModel: "NonExistentModel" });

      await validatorsAction.createValidator({ stake: "10" });

      expect(validatorsAction["startSpinner"]).toHaveBeenCalledWith("Fetching available providers and models...");

      expect(validatorsAction["stopSpinner"]).toHaveBeenCalled();

      expect(inquirer.prompt).toHaveBeenCalledWith([
        {
          type: "list",
          name: "selectedProvider",
          message: "Select a provider:",
          choices: ["Provider1"],
        },
      ]);

      expect(inquirer.prompt).toHaveBeenCalledWith([
        {
          type: "list",
          name: "selectedModel",
          message: "Select a model:",
          choices: ["Model1"],
        },
      ]);

      expect(validatorsAction["logError"]).toHaveBeenCalledWith("Selected model details not found.");
    });

    test("should log an error if an exception occurs during the process", async () => {
      const mockError = new Error("Unexpected error");
      vi.mocked(rpcClient.request).mockRejectedValue(mockError);

      await validatorsAction.createValidator({ stake: "10" });

      expect(validatorsAction["startSpinner"]).toHaveBeenCalledWith("Fetching available providers and models...");

      expect(validatorsAction["failSpinner"]).toHaveBeenCalledWith("Error creating validator", mockError);
    });

    test("should use user-provided config if specified", async () => {
      const mockProvidersAndModels = [
        {
          provider: "Provider1",
          is_available: true,
          is_model_available: true,
          model: "Model1",
          config: { max_tokens: 500 },
          plugin: "Plugin1",
          plugin_config: { api_key_env_var: "KEY1" },
        },
      ];
      const mockResponse = { result: { id: 123 } };

      vi.mocked(rpcClient.request)
        .mockResolvedValueOnce({ result: mockProvidersAndModels })
        .mockResolvedValueOnce(mockResponse);

      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ selectedProvider: "Provider1" })
        .mockResolvedValueOnce({ selectedModel: "Model1" });

      const customConfig = '{"custom_key":"custom_value"}';
      await validatorsAction.createValidator({ stake: "10", config: customConfig });

      expect(validatorsAction["startSpinner"]).toHaveBeenCalledWith("Fetching available providers and models...");
      expect(rpcClient.request).toHaveBeenCalledWith({
        method: "sim_getProvidersAndModels",
        params: [],
      });
      expect(validatorsAction["stopSpinner"]).toHaveBeenCalled();
      expect(inquirer.prompt).toHaveBeenCalledWith([
        { type: "list", name: "selectedProvider", message: "Select a provider:", choices: ["Provider1"] },
      ]);
      expect(inquirer.prompt).toHaveBeenCalledWith([
        { type: "list", name: "selectedModel", message: "Select a model:", choices: ["Model1"] },
      ]);
      expect(validatorsAction["startSpinner"]).toHaveBeenCalledWith("Creating validator...");
      expect(rpcClient.request).toHaveBeenCalledWith({
        method: "sim_createValidator",
        params: [
          10,
          "Provider1",
          "Model1",
          { custom_key: "custom_value" },
          "Plugin1",
          { api_key_env_var: "KEY1" },
        ],
      });
      expect(validatorsAction["succeedSpinner"]).toHaveBeenCalledWith("Validator successfully created:", mockResponse.result);
      expect(validatorsAction["failSpinner"]).not.toHaveBeenCalled();
    });

    test("should log an error if model is provided without provider", async () => {
      vi.spyOn(validatorsAction as any, "logError").mockImplementation(() => {});

      await validatorsAction.createValidator({ stake: "10", model: "Model1" });

      expect(validatorsAction["logError"]).toHaveBeenCalledWith("You must specify a provider if using a model.");
      expect(rpcClient.request).not.toHaveBeenCalled();
    });
  });

  describe("createRandomValidators", () => {
    test("should create random validators with valid count and providers", async () => {
      const mockResponse = { result: { success: true } };
      vi.mocked(rpcClient.request).mockResolvedValue(mockResponse);

      await validatorsAction.createRandomValidators({ count: "5", providers: ["Provider1", "Provider2"], models: [] });

      expect(validatorsAction["startSpinner"]).toHaveBeenCalledWith("Creating 5 random validator(s)...");
      expect(validatorsAction["log"]).toHaveBeenCalledWith("Providers: Provider1, Provider2");
      expect(validatorsAction["log"]).toHaveBeenCalledWith("Models: All");

      expect(rpcClient.request).toHaveBeenCalledWith({
        method: "sim_createRandomValidators",
        params: [5, 1, 10, ["Provider1", "Provider2"], []],
      });

      expect(validatorsAction["succeedSpinner"]).toHaveBeenCalledWith("Random validators successfully created", mockResponse.result);
      expect(validatorsAction["failSpinner"]).not.toHaveBeenCalled();
    });

    test("should create random validators with valid count, providers and models", async () => {
      const mockResponse = { result: { success: true } };
      vi.mocked(rpcClient.request).mockResolvedValue(mockResponse);

      await validatorsAction.createRandomValidators({ count: "10", providers: ["Provider3"], models: ["Model1", "Model2"] });

      expect(validatorsAction["startSpinner"]).toHaveBeenCalledWith("Creating 10 random validator(s)...");
      expect(validatorsAction["log"]).toHaveBeenCalledWith("Providers: Provider3");
      expect(validatorsAction["log"]).toHaveBeenCalledWith("Models: Model1, Model2");

      expect(rpcClient.request).toHaveBeenCalledWith({
        method: "sim_createRandomValidators",
        params: [10, 1, 10, ["Provider3"], ["Model1", "Model2"]],
      });

      expect(validatorsAction["succeedSpinner"]).toHaveBeenCalledWith("Random validators successfully created", mockResponse.result);
      expect(validatorsAction["failSpinner"]).not.toHaveBeenCalled();
    });

    test("should create random validators with default provider message when providers list is empty", async () => {
      const mockResponse = { result: { success: true } };
      vi.mocked(rpcClient.request).mockResolvedValue(mockResponse);

      await validatorsAction.createRandomValidators({ count: "3", providers: [], models: [] });

      expect(validatorsAction["startSpinner"]).toHaveBeenCalledWith("Creating 3 random validator(s)...");
      expect(validatorsAction["log"]).toHaveBeenCalledWith("Providers: All");
      expect(validatorsAction["log"]).toHaveBeenCalledWith("Models: All");

      expect(rpcClient.request).toHaveBeenCalledWith({
        method: "sim_createRandomValidators",
        params: [3, 1, 10, [], []],
      });

      expect(validatorsAction["succeedSpinner"]).toHaveBeenCalledWith("Random validators successfully created", mockResponse.result);
      expect(validatorsAction["failSpinner"]).not.toHaveBeenCalled();
    });

    test("should throw an error for invalid count", async () => {
      await validatorsAction.createRandomValidators({ count: "invalid", providers: ["Provider1"], models: [] });

      expect(validatorsAction["logError"]).toHaveBeenCalledWith("Invalid count. Please provide a positive integer.");
      expect(rpcClient.request).not.toHaveBeenCalled();
      expect(validatorsAction["failSpinner"]).not.toHaveBeenCalled();
    });

    test("should log an error if rpc request fails", async () => {
      const mockError = new Error("RPC failure");
      vi.mocked(rpcClient.request).mockRejectedValue(mockError);

      await validatorsAction.createRandomValidators({ count: "5", providers: ["Provider1"], models: [] });

      expect(validatorsAction["startSpinner"]).toHaveBeenCalledWith("Creating 5 random validator(s)...");

      expect(rpcClient.request).toHaveBeenCalledWith({
        method: "sim_createRandomValidators",
        params: [5, 1, 10, ["Provider1"], []],
      });

      expect(validatorsAction["failSpinner"]).toHaveBeenCalledWith("Error creating random validators", mockError);
    });
  });

  describe("updateValidator", () => {
    test("should fetch and update a validator with new stake", async () => {
      const mockAddress = "mocked_address";
      const mockCurrentValidator = {
        result: {
          address: "mocked_address",
          stake: 100,
          provider: "Provider1",
          model: "Model1",
          config: { max_tokens: 500 },
        },
      };
      const mockResponse = { result: { success: true } };

      vi.mocked(rpcClient.request)
        .mockResolvedValueOnce(mockCurrentValidator)
        .mockResolvedValueOnce(mockResponse);

      await validatorsAction.updateValidator({ address: mockAddress, stake: "200" });

      expect(validatorsAction["startSpinner"]).toHaveBeenCalledWith(`Fetching validator with address: ${mockAddress}...`);
      expect(rpcClient.request).toHaveBeenCalledWith({
        method: "sim_getValidator",
        params: [mockAddress],
      });

      expect(validatorsAction["log"]).toHaveBeenCalledWith("Current Validator Details:", mockCurrentValidator.result);
      expect(validatorsAction["setSpinnerText"]).toHaveBeenCalledWith("Updating Validator...");

      expect(rpcClient.request).toHaveBeenCalledWith({
        method: "sim_updateValidator",
        params: [
          "mocked_address",
          "200",
          "Provider1",
          "Model1",
          { max_tokens: 500 },
        ],
      });

      expect(validatorsAction["succeedSpinner"]).toHaveBeenCalledWith("Validator successfully updated", mockResponse.result);
      expect(validatorsAction["failSpinner"]).not.toHaveBeenCalled();
    });

    test("should fetch and update a validator with new provider and model", async () => {
      const mockAddress = "mocked_address";
      const mockCurrentValidator = {
        result: {
          address: "mocked_address",
          stake: "100",
          provider: "Provider1",
          model: "Model1",
          config: { max_tokens: 500 },
        },
      };
      const mockResponse = { result: { success: true } };

      vi.mocked(rpcClient.request)
        .mockResolvedValueOnce(mockCurrentValidator)
        .mockResolvedValueOnce(mockResponse);

      await validatorsAction.updateValidator({ address: mockAddress, provider: "Provider2", model: "Model2" });

      expect(validatorsAction["startSpinner"]).toHaveBeenCalledWith(`Fetching validator with address: ${mockAddress}...`);
      expect(rpcClient.request).toHaveBeenCalledWith({
        method: "sim_getValidator",
        params: [mockAddress],
      });

      expect(validatorsAction["log"]).toHaveBeenCalledWith("Current Validator Details:", mockCurrentValidator.result);
      expect(validatorsAction["setSpinnerText"]).toHaveBeenCalledWith("Updating Validator...");

      expect(rpcClient.request).toHaveBeenCalledWith({
        method: "sim_updateValidator",
        params: [
          "mocked_address",
          "100",
          "Provider2",
          "Model2",
          { max_tokens: 500 },
        ],
      });

      expect(validatorsAction["succeedSpinner"]).toHaveBeenCalledWith("Validator successfully updated", mockResponse.result);
      expect(validatorsAction["failSpinner"]).not.toHaveBeenCalled();
    });

    test("should fetch and update a validator with new config", async () => {
      const mockAddress = "mocked_address";
      const mockCurrentValidator = {
        result: {
          address: "mocked_address",
          stake: "100",
          provider: "Provider1",
          model: "Model1",
          config: { max_tokens: 500 },
        },
      };
      const mockResponse = { result: { success: true } };

      vi.mocked(rpcClient.request)
        .mockResolvedValueOnce(mockCurrentValidator)
        .mockResolvedValueOnce(mockResponse);

      const newConfig = '{"max_tokens":1000}';
      await validatorsAction.updateValidator({ address: mockAddress, config: newConfig });

      expect(validatorsAction["startSpinner"]).toHaveBeenCalledWith(`Fetching validator with address: ${mockAddress}...`);
      expect(rpcClient.request).toHaveBeenCalledWith({
        method: "sim_getValidator",
        params: [mockAddress],
      });

      expect(validatorsAction["log"]).toHaveBeenCalledWith("Current Validator Details:", mockCurrentValidator.result);
      expect(validatorsAction["setSpinnerText"]).toHaveBeenCalledWith("Updating Validator...");

      expect(rpcClient.request).toHaveBeenCalledWith({
        method: "sim_updateValidator",
        params: [
          "mocked_address",
          "100",
          "Provider1",
          "Model1",
          { max_tokens: 1000 },
        ],
      });

      expect(validatorsAction["succeedSpinner"]).toHaveBeenCalledWith("Validator successfully updated", mockResponse.result);
      expect(validatorsAction["failSpinner"]).not.toHaveBeenCalled();
    });

    test("should log an error if updateValidator RPC call fails", async () => {
      const mockAddress = "mocked_address";
      const mockCurrentValidator = {
        result: {
          address: "mocked_address",
          stake: "100",
          provider: "Provider1",
          model: "Model1",
          config: { max_tokens: 500 },
        },
      };
      const mockError = new Error("RPC failure");

      vi.mocked(rpcClient.request)
        .mockResolvedValueOnce(mockCurrentValidator)
        .mockRejectedValueOnce(mockError);

      vi.spyOn(validatorsAction as any, "failSpinner").mockImplementation(() => {});

      await validatorsAction.updateValidator({ address: mockAddress, stake: "200" });

      expect(rpcClient.request).toHaveBeenCalledWith({
        method: "sim_getValidator",
        params: [mockAddress],
      });

      expect(rpcClient.request).toHaveBeenCalledWith({
        method: "sim_updateValidator",
        params: [
          "mocked_address",
          "200",
          "Provider1",
          "Model1",
          { max_tokens: 500 },
        ],
      });

      expect(validatorsAction["failSpinner"]).toHaveBeenCalledWith("Error updating validator", mockError);
    });

    test("should log an error for invalid stake value", async () => {
      const mockAddress = "mocked_address";
      const mockCurrentValidator = {
        result: {
          address: "mocked_address",
          stake: 100,
          provider: "Provider1",
          model: "Model1",
          config: { max_tokens: 500 },
        },
      };

      vi.mocked(rpcClient.request).mockResolvedValue(mockCurrentValidator);

      vi.spyOn(validatorsAction as any, "failSpinner").mockImplementation(() => {});

      await validatorsAction.updateValidator({ address: mockAddress, stake: "-10" });

      expect(validatorsAction["startSpinner"]).toHaveBeenCalledWith(`Fetching validator with address: ${mockAddress}...`);
      expect(rpcClient.request).toHaveBeenCalledWith({
        method: "sim_getValidator",
        params: [mockAddress],
      });

      expect(validatorsAction["failSpinner"]).toHaveBeenCalledWith("Invalid stake value. Stake must be a positive integer.");
      expect(rpcClient.request).toHaveBeenCalledTimes(1);
    });
  });
});