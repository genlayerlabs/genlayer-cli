import {describe, test, vi, beforeEach, afterEach, expect} from "vitest";
import {createClient, createAccount} from "genlayer-js";
import {CallAction} from "../../src/commands/contracts/call";

vi.mock("genlayer-js");

describe("CallAction", () => {
  let callActions: CallAction;
  const mockClient = {
    readContract: vi.fn(),
    writeContract: vi.fn(),
    waitForTransactionReceipt: vi.fn(),
    getContractSchema: vi.fn(),
    initializeConsensusSmartContract: vi.fn(),
  };

  const mockPrivateKey = "mocked_private_key";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue(mockClient as any);
    vi.mocked(createAccount).mockReturnValue({privateKey: mockPrivateKey} as any);
    callActions = new CallAction();
    vi.spyOn(callActions as any, "getPrivateKey").mockResolvedValue(mockPrivateKey);

    vi.spyOn(callActions as any, "startSpinner").mockImplementation(() => {});
    vi.spyOn(callActions as any, "succeedSpinner").mockImplementation(() => {});
    vi.spyOn(callActions as any, "failSpinner").mockImplementation(() => {});
    vi.spyOn(callActions as any, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("calls readContract successfully", async () => {
    const options = {args: [1, 2, "Hello"]};
    const mockResult = "mocked_result";

    vi.mocked(mockClient.readContract).mockResolvedValue(mockResult);

    await callActions.call({
      contractAddress: "0xMockedContract",
      method: "getData",
      ...options,
    });

    expect(mockClient.readContract).toHaveBeenCalledWith({
      address: "0xMockedContract",
      functionName: "getData",
      args: [1, 2, "Hello"],
    });
    expect(callActions["succeedSpinner"]).toHaveBeenCalledWith(
      "Read operation successfully executed",
      "mocked_result",
    );
  });

  test("handles readContract errors", async () => {
    vi.mocked(mockClient.readContract).mockRejectedValue(new Error("Mocked read error"));

    await callActions.call({contractAddress: "0xMockedContract", method: "getData", args: [1]});

    expect(callActions["failSpinner"]).toHaveBeenCalledWith("Error during read operation", expect.any(Error));
  });

  test("uses custom RPC URL when provided", async () => {
    const options = {args: [1, 2, "Hello"], rpc: "https://custom-rpc-url.com"};
    const mockResult = "mocked_result";

    vi.mocked(mockClient.readContract).mockResolvedValue(mockResult);

    await callActions.call({
      contractAddress: "0xMockedContract",
      method: "getData",
      ...options,
    });

    expect(createClient).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "https://custom-rpc-url.com",
      }),
    );
    expect(mockClient.readContract).toHaveBeenCalledWith({
      address: "0xMockedContract",
      functionName: "getData",
      args: [1, 2, "Hello"],
    });
    expect(callActions["succeedSpinner"]).toHaveBeenCalledWith(
      "Read operation successfully executed",
      "mocked_result",
    );
  });
});
