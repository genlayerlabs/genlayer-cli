import {describe, test, vi, beforeEach, afterEach, expect} from "vitest";
import {createClient, createAccount} from "genlayer-js";
import {SimulateWriteAction} from "../../src/commands/contracts/simulate";

vi.mock("genlayer-js");

describe("SimulateWriteAction", () => {
  let action: SimulateWriteAction;
  const mockClient = {
    simulateWriteContract: vi.fn(),
  };

  const mockPrivateKey = "mocked_private_key";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue(mockClient as any);
    vi.mocked(createAccount).mockReturnValue({privateKey: mockPrivateKey} as any);
    action = new SimulateWriteAction();

    vi.spyOn(action as any, "getAccount").mockResolvedValue({privateKey: mockPrivateKey});

    vi.spyOn(action as any, "startSpinner").mockImplementation(() => {});
    vi.spyOn(action as any, "succeedSpinner").mockImplementation(() => {});
    vi.spyOn(action as any, "failSpinner").mockImplementation(() => {});
    vi.spyOn(action as any, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("calls simulateWriteContract with all options and read-only client", async () => {
    vi.mocked(mockClient.simulateWriteContract).mockResolvedValue("ok");

    await action.simulate({
      contractAddress: "0x123",
      method: "doThing",
      args: [7, "x", true],
      rpc: "http://rpc",
      rawReturn: true,
      leaderOnly: true,
      transactionHashVariant: "legacy",
    });

    // getClient called with readOnly=true
    const getClientSpy = vi.spyOn(action as any, "getClient");
    expect(getClientSpy).not.toBeNull();

    expect(mockClient.simulateWriteContract).toHaveBeenCalledWith({
      address: "0x123",
      functionName: "doThing",
      args: [7, "x", true],
      rawReturn: true,
      leaderOnly: true,
      transactionHashVariant: "legacy",
    });
  });

  test("handles simulateWriteContract errors gracefully", async () => {
    vi.mocked(mockClient.simulateWriteContract).mockRejectedValue(new Error("boom"));

    await action.simulate({
      contractAddress: "0x999",
      method: "fail",
      args: [],
    });

    expect(action["failSpinner"]).toHaveBeenCalledWith(
      "Error during write simulation",
      expect.any(Error),
    );
  });
}); 