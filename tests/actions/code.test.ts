import {describe, test, vi, beforeEach, afterEach, expect} from "vitest";
import {createClient, createAccount} from "genlayer-js";
import {CodeAction} from "../../src/commands/contracts/code";

vi.mock("genlayer-js");

describe("CodeAction", () => {
  let codeAction: CodeAction;
  const mockClient = {
    getContractCode: vi.fn(),
    initializeConsensusSmartContract: vi.fn(),
  };

  const mockPrivateKey = "mocked_private_key";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue(mockClient as any);
    vi.mocked(createAccount).mockReturnValue({privateKey: mockPrivateKey} as any);
    codeAction = new CodeAction();
    vi.spyOn(codeAction as any, "getAccount").mockResolvedValue({privateKey: mockPrivateKey});

    vi.spyOn(codeAction as any, "startSpinner").mockImplementation(() => {});
    vi.spyOn(codeAction as any, "succeedSpinner").mockImplementation(() => {});
    vi.spyOn(codeAction as any, "failSpinner").mockImplementation(() => {});
    vi.spyOn(codeAction as any, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("gets contract code successfully", async () => {
    const mockResult = "0x600160...";

    vi.mocked(mockClient.getContractCode).mockResolvedValue(mockResult as any);

    await codeAction.code({
      contractAddress: "0xMockedContract",
    });

    expect(mockClient.getContractCode).toHaveBeenCalledWith("0xMockedContract");
    expect(codeAction["succeedSpinner"]).toHaveBeenCalledWith(
      "Contract code retrieved successfully",
      mockResult,
    );
  });

  test("handles getContractCode errors", async () => {
    vi.mocked(mockClient.getContractCode).mockRejectedValue(new Error("Mocked code error"));

    await codeAction.code({contractAddress: "0xMockedContract"});

    expect(codeAction["failSpinner"]).toHaveBeenCalledWith("Error retrieving contract code", expect.any(Error));
  });

  test("uses custom RPC URL when provided", async () => {
    const mockResult = "0x600160...";
    vi.mocked(mockClient.getContractCode).mockResolvedValue(mockResult as any);

    await codeAction.code({
      contractAddress: "0xMockedContract",
      rpc: "https://custom-rpc-url.com",
    });

    expect(createClient).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "https://custom-rpc-url.com",
      }),
    );
    expect(mockClient.getContractCode).toHaveBeenCalledWith("0xMockedContract");
    expect(codeAction["succeedSpinner"]).toHaveBeenCalledWith(
      "Contract code retrieved successfully",
      mockResult,
    );
  });

  test("initializes consensus smart contract", async () => {
    vi.mocked(mockClient.getContractCode).mockResolvedValue("0x" as any);

    await codeAction.code({contractAddress: "0xMockedContract"});

    expect(mockClient.initializeConsensusSmartContract).toHaveBeenCalled();
  });
});


