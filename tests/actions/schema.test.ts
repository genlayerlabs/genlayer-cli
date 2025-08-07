import {describe, test, vi, beforeEach, afterEach, expect} from "vitest";
import {createClient, createAccount} from "genlayer-js";
import {SchemaAction} from "../../src/commands/contracts/schema";

vi.mock("genlayer-js");

describe("SchemaAction", () => {
  let schemaAction: SchemaAction;
  const mockClient = {
    getContractSchema: vi.fn(),
    initializeConsensusSmartContract: vi.fn(),
  };

  const mockPrivateKey = "mocked_private_key";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue(mockClient as any);
    vi.mocked(createAccount).mockReturnValue({privateKey: mockPrivateKey} as any);
    schemaAction = new SchemaAction();
    vi.spyOn(schemaAction as any, "getAccount").mockResolvedValue({privateKey: mockPrivateKey});

    vi.spyOn(schemaAction as any, "startSpinner").mockImplementation(() => {});
    vi.spyOn(schemaAction as any, "succeedSpinner").mockImplementation(() => {});
    vi.spyOn(schemaAction as any, "failSpinner").mockImplementation(() => {});
    vi.spyOn(schemaAction as any, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("gets contract schema successfully", async () => {
    const mockResult = {
      methods: {
        getData: {
          params: [["value", "int"]],
          ret: "int",
          readonly: true,
        },
      },
    };

    vi.mocked(mockClient.getContractSchema).mockResolvedValue(mockResult);

    await schemaAction.schema({
      contractAddress: "0xMockedContract",
    });

    expect(mockClient.getContractSchema).toHaveBeenCalledWith("0xMockedContract");
    expect(schemaAction["succeedSpinner"]).toHaveBeenCalledWith(
      "Contract schema retrieved successfully",
      mockResult,
    );
  });

  test("handles getContractSchema errors", async () => {
    vi.mocked(mockClient.getContractSchema).mockRejectedValue(new Error("Mocked schema error"));

    await schemaAction.schema({contractAddress: "0xMockedContract"});

    expect(schemaAction["failSpinner"]).toHaveBeenCalledWith("Error retrieving contract schema", expect.any(Error));
  });

  test("uses custom RPC URL when provided", async () => {
    const mockResult = {methods: {}};
    vi.mocked(mockClient.getContractSchema).mockResolvedValue(mockResult);

    await schemaAction.schema({
      contractAddress: "0xMockedContract",
      rpc: "https://custom-rpc-url.com",
    });

    expect(createClient).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "https://custom-rpc-url.com",
      }),
    );
    expect(mockClient.getContractSchema).toHaveBeenCalledWith("0xMockedContract");
    expect(schemaAction["succeedSpinner"]).toHaveBeenCalledWith(
      "Contract schema retrieved successfully",
      mockResult,
    );
  });

  test("initializes consensus smart contract", async () => {
    const mockResult = {methods: {}};
    vi.mocked(mockClient.getContractSchema).mockResolvedValue(mockResult);

    await schemaAction.schema({contractAddress: "0xMockedContract"});

    expect(mockClient.initializeConsensusSmartContract).toHaveBeenCalled();
  });
}); 