import { describe, beforeEach, test, expect, vi, Mock } from "vitest";
import fetch from "node-fetch";
import { JsonRpcClient, JsonRPCParams } from "../../src/lib/clients/jsonRpcClient";

vi.mock("node-fetch", () => ({
  default: vi.fn(),
}));

describe("JsonRpcClient - Successful and Unsuccessful Requests", () => {
  let rpcClient: JsonRpcClient;
  const mockServerUrl = "http://mock-server-url.com";

  beforeEach(() => {
    rpcClient = new JsonRpcClient(mockServerUrl);
  });

  test("should make a successful JSON-RPC request and return the JSON response", async () => {
    const mockResponse = { result: "success" };

    (fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const params: JsonRPCParams = {
      method: "testMethod",
      params: ["param1", "param2"],
    };

    const response = await rpcClient.request(params);

    expect(fetch).toHaveBeenCalledWith(mockServerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: expect.stringContaining('"method":"testMethod"'),
    });
    expect(response).toEqual(mockResponse);
  });

  test("should return null when the fetch response is not ok", async () => {
    (fetch as Mock).mockResolvedValueOnce({
      ok: false,
      statusText: "Something went wrong",
      json: async () => ({ error: "Something went wrong" }),
    });

    const params: JsonRPCParams = {
      method: "testMethod",
      params: ["param1", "param2"],
    };

    await expect(rpcClient.request(params)).rejects.toThrowError("Something went wrong");
    expect(fetch).toHaveBeenCalledWith(mockServerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: expect.stringContaining('"method":"testMethod"'),
    });
  });

  test("should reject JSON-RPC error responses even when HTTP status is ok", async () => {
    (fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        jsonrpc: "2.0",
        error: { code: -32603, message: "RPC failed" },
        id: "1",
      }),
    });

    const params: JsonRPCParams = {
      method: "testMethod",
      params: ["param1"],
    };

    await expect(rpcClient.request(params)).rejects.toThrowError("RPC failed");
  });
});
