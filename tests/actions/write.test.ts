import {describe, test, vi, beforeEach, afterEach, expect} from "vitest";
import {createClient, createAccount} from "genlayer-js";
import {WriteAction} from "../../src/commands/contracts/write";

vi.mock("genlayer-js");

describe("WriteAction", () => {
  let writeAction: WriteAction;
  const mockClient = {
    writeContract: vi.fn(),
    waitForTransactionReceipt: vi.fn(),
    initializeConsensusSmartContract: vi.fn(),
  };

  const mockPrivateKey = "mocked_private_key";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue(mockClient as any);
    vi.mocked(createAccount).mockReturnValue({privateKey: mockPrivateKey} as any);
    writeAction = new WriteAction();
    vi.spyOn(writeAction as any, "getPrivateKey").mockResolvedValue(mockPrivateKey);

    vi.spyOn(writeAction as any, "startSpinner").mockImplementation(() => {});
    vi.spyOn(writeAction as any, "succeedSpinner").mockImplementation(() => {});
    vi.spyOn(writeAction as any, "failSpinner").mockImplementation(() => {});
    vi.spyOn(writeAction as any, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("calls writeContract successfully", async () => {
    const options = {args: [42, "Update"]};
    const mockHash = "0xMockedTransactionHash";
    const mockReceipt = {status: "success"};

    vi.mocked(mockClient.writeContract).mockResolvedValue(mockHash);
    vi.mocked(mockClient.waitForTransactionReceipt).mockResolvedValue(mockReceipt);

    await writeAction.write({
      contractAddress: "0xMockedContract",
      method: "updateData",
      ...options,
    });

    expect(mockClient.writeContract).toHaveBeenCalledWith({
      address: "0xMockedContract",
      functionName: "updateData",
      args: [42, "Update"],
      value: 0n,
    });
    expect(writeAction["log"]).toHaveBeenCalledWith("Write Transaction Hash:", mockHash);
    expect(writeAction["succeedSpinner"]).toHaveBeenCalledWith(
      "Write operation successfully executed",
      mockReceipt,
    );
  });

  test("handles writeContract errors", async () => {
    vi.mocked(mockClient.writeContract).mockRejectedValue(new Error("Mocked write error"));

    await writeAction.write({contractAddress: "0xMockedContract", method: "updateData", args: [1]});

    expect(writeAction["failSpinner"]).toHaveBeenCalledWith(
      "Error during write operation",
      expect.any(Error),
    );
  });

  test("uses custom RPC URL for write operations", async () => {
    const options = {args: [42, "Update"], rpc: "https://custom-rpc-url.com"};
    const mockHash = "0xMockedTransactionHash";
    const mockReceipt = {status: "success"};

    vi.mocked(mockClient.writeContract).mockResolvedValue(mockHash);
    vi.mocked(mockClient.waitForTransactionReceipt).mockResolvedValue(mockReceipt);

    await writeAction.write({
      contractAddress: "0xMockedContract",
      method: "updateData",
      ...options,
    });

    expect(createClient).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "https://custom-rpc-url.com",
      }),
    );
    expect(mockClient.writeContract).toHaveBeenCalledWith({
      address: "0xMockedContract",
      functionName: "updateData",
      args: [42, "Update"],
      value: 0n,
    });
    expect(writeAction["succeedSpinner"]).toHaveBeenCalledWith(
      "Write operation successfully executed",
      mockReceipt,
    );
  });
});
