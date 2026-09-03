import type {Address, Hash} from "genlayer-js/types";
import {serializeBridgeTx, type BridgeTxRequest, type SerializedBridgeTx} from "./browserBridge";
import type {WalletSessionDescriptor} from "./sessionDescriptor";
import {HEARTBEAT_DEAD_MS, TX_TIMEOUT_MS, CONNECT_TIMEOUT_MS, TAB_CLOSED_MESSAGE} from "./sessionConstants";

/** Mirror of BridgeSessionState over the wire (GET /api/state). */
export interface SessionState {
  connected: boolean;
  address: Address | null;
  chainId: number;
  chainIdHex: string;
  chainName: string;
  url: string;
  lastPagePollAt: number;
  queuedCount: number;
  createdAt: number;
}

export interface SessionTxResult {
  txHash: Hash;
  from?: Address;
}

type FetchFn = typeof fetch;

/**
 * HTTP client for a running wallet-session daemon. Every request carries the
 * bridge token in X-Bridge-Token. No new dependencies — plain fetch against
 * http://127.0.0.1:<port>.
 */
export class WalletSessionClient {
  private readonly base: string;
  private readonly token: string;
  private readonly fetchFn: FetchFn;
  private readonly pollIntervalMs: number;

  constructor(
    readonly descriptor: WalletSessionDescriptor,
    opts: {fetchFn?: FetchFn; pollIntervalMs?: number} = {},
  ) {
    this.base = `http://127.0.0.1:${descriptor.port}`;
    this.token = descriptor.token;
    this.fetchFn = opts.fetchFn ?? fetch;
    this.pollIntervalMs = opts.pollIntervalMs ?? 1000;
  }

  private headers(json = false): Record<string, string> {
    const h: Record<string, string> = {"X-Bridge-Token": this.token};
    if (json) h["Content-Type"] = "application/json";
    return h;
  }

  /** Liveness probe. Any connection error (ECONNREFUSED, etc.) → false. */
  async ping(): Promise<boolean> {
    try {
      const res = await this.fetchFn(`${this.base}/api/ping`, {headers: this.headers()});
      if (!res.ok) return false;
      const body: any = await res.json().catch(() => ({}));
      return body?.status === "ok";
    } catch {
      return false;
    }
  }

  async state(): Promise<SessionState> {
    const res = await this.fetchFn(`${this.base}/api/state`, {headers: this.headers()});
    if (!res.ok) throw new Error(`Wallet session returned ${res.status} for /api/state`);
    return (await res.json()) as SessionState;
  }

  /** Enqueue a tx onto the daemon's wallet queue; returns the tx id. */
  async enqueueTx(tx: Omit<BridgeTxRequest, "id">): Promise<string> {
    const payload: SerializedBridgeTx = serializeBridgeTx(tx);
    const res = await this.fetchFn(`${this.base}/api/enqueue`, {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify(payload),
    });
    if (res.status === 409) {
      const body: any = await res.json().catch(() => ({}));
      if (body?.error === "tab-closed") throw new Error(TAB_CLOSED_MESSAGE);
      if (body?.error === "wallet-not-connected") {
        throw new Error(
          "The wallet session is not connected yet. Approve the connection in your browser, " +
            "or run 'genlayer wallet connect'.",
        );
      }
      throw new Error(`Wallet session cannot accept transactions: ${body?.error ?? "unknown"}`);
    }
    if (!res.ok) throw new Error(`Wallet session returned ${res.status} for /api/enqueue`);
    const body: any = await res.json();
    if (!body?.id) throw new Error("Wallet session did not return a transaction id");
    return body.id as string;
  }

  /**
   * Poll for a tx result. Fails fast if the page heartbeat goes stale (tab
   * closed) rather than blocking for the full timeout.
   */
  async waitForTxResult(id: string, timeoutMs = TX_TIMEOUT_MS): Promise<SessionTxResult> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const res = await this.fetchFn(`${this.base}/api/tx?id=${encodeURIComponent(id)}`, {
        headers: this.headers(),
      });
      if (res.ok) {
        const rec: any = await res.json();
        if (rec.state === "done") {
          if (rec.status === "sent" && rec.txHash) {
            return {
              txHash: rec.txHash as Hash,
              from: typeof rec.from === "string" ? (rec.from as Address) : undefined,
            };
          }
          if (rec.status === "rejected") throw new Error("Transaction rejected in wallet");
          throw new Error(rec.message || "Transaction failed in wallet");
        }
        // pending | delivered → keep polling.
      }

      // Fail fast on a dead tab instead of hanging until timeout.
      const st = await this.state().catch(() => null);
      if (st && st.lastPagePollAt > 0 && Date.now() - st.lastPagePollAt > HEARTBEAT_DEAD_MS) {
        throw new Error(TAB_CLOSED_MESSAGE);
      }

      if (Date.now() > deadline) {
        throw new Error(`Timed out waiting for the wallet to sign the transaction (id ${id}).`);
      }
      await new Promise(r => setTimeout(r, this.pollIntervalMs));
    }
  }

  /** Poll session state until the wallet is connected; returns the signer address. */
  async waitForConnection(timeoutMs = CONNECT_TIMEOUT_MS): Promise<Address> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const st = await this.state().catch(() => null);
      if (st?.connected && st.address) return st.address;
      if (Date.now() > deadline) {
        throw new Error(
          "Timed out waiting for the browser wallet to connect. " +
            "Open the session tab and approve the connection, or run 'genlayer wallet connect'.",
        );
      }
      await new Promise(r => setTimeout(r, this.pollIntervalMs));
    }
  }

  /** Ask the daemon to shut down. Best-effort — tolerate a dropped socket. */
  async shutdown(): Promise<void> {
    try {
      await this.fetchFn(`${this.base}/api/shutdown`, {method: "POST", headers: this.headers(true)});
    } catch {
      // The server may close the socket before the response flushes.
    }
  }
}
