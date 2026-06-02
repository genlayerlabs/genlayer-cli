import fetch from "node-fetch";
import {v4 as uuidv4} from "uuid";

import {DEFAULT_JSON_RPC_URL} from "../config/simulator";

export interface JsonRPCParams {
  method: string;
  params: any[];
}

export class JsonRpcClient {
  serverUrl: string;

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl;
  }

  async request({method, params}: JsonRPCParams): Promise<any | null> {
    const response = await fetch(this.serverUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: uuidv4(),
        method,
        params,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result?.error?.message || result?.error || response.statusText);
    }

    if (result?.error) {
      throw new Error(result.error.message || String(result.error));
    }

    return result;

  }
}
export const rpcClient = new JsonRpcClient(DEFAULT_JSON_RPC_URL);
