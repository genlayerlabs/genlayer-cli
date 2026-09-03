import http from "node:http";
import {randomUUID, timingSafeEqual} from "node:crypto";
import type {AddressInfo} from "node:net";
import {hexToBigInt} from "viem";
import type {Address, Hash} from "genlayer-js/types";
import {openUrl as defaultOpenUrl} from "../clients/system";
import {BRIDGE_PAGE_HTML} from "./bridgePage";
import {LONG_POLL_MS, HEARTBEAT_DEAD_MS} from "./sessionConstants";

export interface BridgeChainParams {
  chainId: number;
  chainName: string;
  rpcUrls: string[];
  nativeCurrency: {name: string; symbol: string; decimals: number};
  blockExplorerUrls?: string[];
}

export interface BridgeTxRequest {
  id: string;
  to: Address;
  data: `0x${string}`;
  value?: bigint;
  gasPrice?: bigint;
  gas?: bigint;
  nonce?: number;
  type?: string;
  label: string;
}

/**
 * Wire shape of a tx over HTTP: bigint quantities are hex strings. This is
 * exactly what `serializeBridgeTx` emits and what the session client POSTs to
 * `/api/enqueue`. The daemon parses it back with `parseBridgeTx`. Keeping the
 * pair here means client and server can never drift.
 */
export interface SerializedBridgeTx {
  to: Address;
  data: `0x${string}`;
  value?: string;
  gasPrice?: string;
  gas?: string;
  nonce?: string;
  type?: string;
  label: string;
}

/** bigint → 0x-hex serialization for the wire (client → daemon enqueue). */
export function serializeBridgeTx(tx: Omit<BridgeTxRequest, "id">): SerializedBridgeTx {
  return {
    to: tx.to,
    data: tx.data,
    value: tx.value !== undefined ? `0x${tx.value.toString(16)}` : undefined,
    gasPrice: tx.gasPrice !== undefined ? `0x${tx.gasPrice.toString(16)}` : undefined,
    gas: tx.gas !== undefined ? `0x${tx.gas.toString(16)}` : undefined,
    nonce: tx.nonce !== undefined ? `0x${tx.nonce.toString(16)}` : undefined,
    type: tx.type,
    label: tx.label,
  };
}

/** 0x-hex → bigint parsing on the daemon side (enqueue handler). */
export function parseBridgeTx(s: SerializedBridgeTx): Omit<BridgeTxRequest, "id"> {
  return {
    to: s.to,
    data: s.data,
    value: s.value !== undefined ? hexToBigInt(s.value as `0x${string}`) : undefined,
    gasPrice: s.gasPrice !== undefined ? hexToBigInt(s.gasPrice as `0x${string}`) : undefined,
    gas: s.gas !== undefined ? hexToBigInt(s.gas as `0x${string}`) : undefined,
    nonce: s.nonce !== undefined ? Number(hexToBigInt(s.nonce as `0x${string}`)) : undefined,
    type: s.type,
    label: s.label,
  };
}

/** Terminal record for a tx the wallet handled (result store, remote polling). */
export type TxResultRecord =
  | {state: "pending"}
  | {state: "delivered"}
  | {state: "done"; status: "sent"; txHash: Hash; from?: Address; completedAt: number}
  | {state: "done"; status: "rejected" | "error"; message: string; from?: Address; completedAt: number};

/** Shape returned by GET /api/state (also mirrored in sessionClient.ts). */
export interface BridgeSessionState {
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

export interface BrowserWalletBridgeOptions {
  chain: BridgeChainParams;
  openUrl?: (url: string) => Promise<unknown>;
  connectTimeoutMs?: number;
  txTimeoutMs?: number;
  log?: (msg: string) => void;
  /** Register a SIGINT handler that closes the server. Default: true. */
  handleSigint?: boolean;
  /**
   * Persistent (daemon) mode: enables /api/enqueue, /api/tx, /api/state,
   * /api/ping, /api/shutdown, the result store, and heartbeat tracking. The
   * page also learns it should stay open between txs. Default false — the
   * per-command / wizard path keeps exactly the current one-shot behaviour.
   */
  persistent?: boolean;
  /** Called with the connected address on every /api/connected (daemon: rewrite descriptor). */
  onConnected?: (address: Address) => void;
  /** Called when a tx is enqueued (daemon: bump lastUsed). */
  onActivity?: () => void;
  /** Called when /api/shutdown is received (daemon: remove descriptor + exit). */
  onShutdown?: () => void;
}

const RESULT_GC_MS = 10 * 60_000;
/** Routes whose POSTs are page-originated and must pass the strict Origin check. */
const PAGE_POST_ROUTES = new Set(["/api/connected", "/api/result"]);

/** Reason codes surfaced as HTTP 409 on /api/enqueue and mapped to fail-fast messages. */
export type EnqueueErrorReason = "bridge-closed" | "wallet-not-connected" | "tab-closed";
export class EnqueueError extends Error {
  constructor(readonly reason: EnqueueErrorReason) {
    super(reason);
    this.name = "EnqueueError";
  }
}

interface PendingTx {
  request: BridgeTxRequest;
  resolve: (hash: Hash) => void;
  reject: (err: Error) => void;
  timer?: NodeJS.Timeout;
  delivered: boolean;
  expectedSigner?: Address;
  from?: Address;
}

interface NextWaiter {
  resolve: (payload: unknown) => void;
  timer: NodeJS.Timeout;
}

const DEFAULT_CONNECT_TIMEOUT = 180_000;
const DEFAULT_TX_TIMEOUT = 300_000;
const MAX_JSON_BODY_BYTES = 64 * 1024;
// LONG_POLL_MS is imported from ./sessionConstants (single source of truth).

class PayloadTooLargeError extends Error {
  constructor() {
    super("Request body too large");
    this.name = "PayloadTooLargeError";
  }
}

function sameAddress(a: Address, b: Address): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Dependency-free localhost bridge that lets a browser wallet (MetaMask, any
 * injected window.ethereum) sign-and-broadcast transactions on behalf of the
 * CLI. See docs/design in bridgePage.ts for the page side.
 *
 * Security posture:
 *  - binds 127.0.0.1 only, ephemeral port (listen(0))
 *  - per-session token (URL fragment) required on every /api/* call
 *  - Origin header checked on POSTs (blocks DNS-rebinding / cross-site POST)
 *  - Cache-Control: no-store everywhere; single session; closed after use.
 */
export class BrowserWalletBridge {
  private readonly chain: BridgeChainParams;
  private readonly openUrl: (url: string) => Promise<unknown>;
  private readonly connectTimeoutMs: number;
  private readonly txTimeoutMs: number;
  private readonly log: (msg: string) => void;
  private readonly handleSigint: boolean;
  private readonly persistent: boolean;
  private readonly onConnected?: (address: Address) => void;
  private readonly onActivity?: () => void;
  private readonly onShutdown?: () => void;

  private readonly token = randomUUID();
  private server: http.Server | null = null;
  private boundPort = 0;
  private origin = "";
  private url = "";
  private closed = false;
  private finalMessage = "All done. You can close this tab.";
  private readonly createdAt = Date.now();

  private connectedAddress: Address | null = null;
  private connectResolve: ((addr: Address) => void) | null = null;
  private connectReject: ((err: Error) => void) | null = null;
  private connectTimer: NodeJS.Timeout | null = null;

  private readonly txQueue: PendingTx[] = [];
  private nextWaiter: NextWaiter | null = null;
  private sigintHandler: (() => void) | null = null;

  /** Last time the page polled /api/next — the tab-liveness heartbeat. */
  private lastPagePollAt = 0;
  /** Result store for remote (HTTP-polling) callers, keyed by tx id. */
  private readonly resultStore = new Map<string, TxResultRecord>();

  constructor(options: BrowserWalletBridgeOptions) {
    this.chain = options.chain;
    this.openUrl = options.openUrl ?? defaultOpenUrl;
    this.connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT;
    this.txTimeoutMs = options.txTimeoutMs ?? DEFAULT_TX_TIMEOUT;
    this.log = options.log ?? (() => {});
    this.handleSigint = options.handleSigint ?? true;
    this.persistent = options.persistent ?? false;
    this.onConnected = options.onConnected;
    this.onActivity = options.onActivity;
    this.onShutdown = options.onShutdown;
  }

  /** Whether the bridge is running in persistent (daemon) mode. */
  isPersistent(): boolean {
    return this.persistent;
  }

  getToken(): string {
    return this.token;
  }

  getPort(): number {
    const addr = this.server?.address() as AddressInfo | null;
    return addr?.port ?? 0;
  }

  /** True when the page heartbeat is fresh enough to consider the tab alive. */
  private tabAlive(): boolean {
    if (this.lastPagePollAt === 0) return true; // no poll yet: not yet stale
    return Date.now() - this.lastPagePollAt <= HEARTBEAT_DEAD_MS;
  }

  getState(): BridgeSessionState {
    return {
      connected: this.connectedAddress !== null,
      address: this.connectedAddress,
      chainId: this.chain.chainId,
      chainIdHex: `0x${this.chain.chainId.toString(16)}`,
      chainName: this.chain.chainName,
      url: this.url,
      lastPagePollAt: this.lastPagePollAt,
      queuedCount: this.txQueue.length,
      createdAt: this.createdAt,
    };
  }

  async start(): Promise<{url: string}> {
    if (this.server) return {url: this.url};

    this.server = http.createServer((req, res) => this.handleRequest(req, res));

    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(0, "127.0.0.1", () => {
        this.server!.removeListener("error", reject);
        resolve();
      });
    });

    const address = this.server.address() as AddressInfo;
    this.boundPort = address.port;
    this.origin = `http://127.0.0.1:${address.port}`;
    this.url = `${this.origin}/#s=${this.token}`;

    if (this.handleSigint) {
      this.sigintHandler = () => {
        void this.close("The CLI was interrupted.");
      };
      process.once("SIGINT", this.sigintHandler);
    }

    // The Tier-2 e2e harness drives its own headless chromium against this URL,
    // so auto-opening the system browser would just spawn a stray tab. Skipped
    // only when the harness sets GENLAYER_E2E_NO_OPEN; production is unaffected.
    if (!process.env.GENLAYER_E2E_NO_OPEN) {
      await this.openUrl(this.url).catch(() => {
        // Non-fatal: user can open the URL manually (headless / SSH).
      });
    }

    return {url: this.url};
  }

  getUrl(): string {
    return this.url;
  }

  async waitForConnection(): Promise<Address> {
    if (this.connectedAddress) return this.connectedAddress;
    return new Promise<Address>((resolve, reject) => {
      this.connectResolve = resolve;
      this.connectReject = reject;
      this.connectTimer = setTimeout(() => {
        this.connectReject = null;
        this.connectResolve = null;
        reject(
          new Error(
            `Timed out waiting for the browser wallet to connect. Open this URL and connect:\n  ${this.url}`,
          ),
        );
      }, this.connectTimeoutMs);
    });
  }

  async sendTransaction(tx: Omit<BridgeTxRequest, "id">): Promise<Hash> {
    if (this.closed) throw new Error("Bridge is closed.");
    const {id, promise} = this.queueTx(tx);
    void id;
    return promise;
  }

  /**
   * Persistent-mode entry point for remote callers: enqueue a tx, record its
   * result in the store (so an HTTP client can poll GET /api/tx?id=…), and
   * return the id synchronously. Throws a 409-mappable reason if the wallet is
   * not usable right now, so commands fail fast rather than queueing into a
   * dead session.
   */
  enqueueTx(tx: Omit<BridgeTxRequest, "id">): string {
    if (this.closed) throw new EnqueueError("bridge-closed");
    if (!this.connectedAddress) throw new EnqueueError("wallet-not-connected");
    if (!this.tabAlive()) throw new EnqueueError("tab-closed");

    const {id, promise} = this.queueTx(tx);
    this.resultStore.set(id, {state: "pending"});
    this.onActivity?.();

    promise.then(
      txHash => {
        const rec = this.resultStore.get(id);
        this.resultStore.set(id, {
          state: "done",
          status: "sent",
          txHash,
          from: (rec && "from" in rec ? (rec as any).from : undefined) ?? this.lastResultFrom.get(id),
          completedAt: Date.now(),
        });
        this.scheduleResultGc();
      },
      (err: Error) => {
        const message = err?.message || String(err);
        const status = /rejected in wallet/i.test(message) ? "rejected" : "error";
        this.resultStore.set(id, {
          state: "done",
          status,
          message,
          from: this.lastResultFrom.get(id),
          completedAt: Date.now(),
        });
        this.scheduleResultGc();
      },
    );

    return id;
  }

  /** Look up a stored result for a remote poller. */
  getTxResult(id: string): TxResultRecord | null {
    return this.resultStore.get(id) ?? null;
  }

  private lastResultFrom = new Map<string, Address>();

  private scheduleResultGc(): void {
    const cutoff = Date.now() - RESULT_GC_MS;
    for (const [id, rec] of this.resultStore) {
      if (rec.state === "done" && rec.completedAt < cutoff) {
        this.resultStore.delete(id);
        this.lastResultFrom.delete(id);
      }
    }
  }

  private queueTx(tx: Omit<BridgeTxRequest, "id">): {id: string; promise: Promise<Hash>} {
    const request: BridgeTxRequest = {...tx, id: randomUUID()};
    const promise = new Promise<Hash>((resolve, reject) => {
      const pending: PendingTx = {
        request,
        resolve,
        reject,
        delivered: false,
        expectedSigner: this.connectedAddress ?? undefined,
      };
      pending.timer = setTimeout(() => {
        const idx = this.txQueue.indexOf(pending);
        if (idx >= 0) this.txQueue.splice(idx, 1);
        reject(
          new Error(
            `Timed out waiting for the wallet to sign "${request.label}". ` +
              `Confirm in your wallet at ${this.url}`,
          ),
        );
      }, this.txTimeoutMs);

      this.txQueue.push(pending);
      this.tryDeliverNext();
    });
    return {id: request.id, promise};
  }

  /** Address of the tx the caller can inspect (for cross-checking `from`). */
  lastConnectedAddress(): Address | null {
    return this.connectedAddress;
  }

  async close(finalMessage?: string): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (finalMessage) this.finalMessage = finalMessage;

    // Flush any waiter with a terminal message so the page stops polling.
    if (this.nextWaiter) {
      clearTimeout(this.nextWaiter.timer);
      this.nextWaiter.resolve({type: "done", message: this.finalMessage});
      this.nextWaiter = null;
    }

    // Reject anything still pending.
    for (const pending of this.txQueue.splice(0)) {
      if (pending.timer) clearTimeout(pending.timer);
      pending.reject(new Error("Bridge closed before the transaction completed."));
    }
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
    if (this.connectReject) {
      this.connectReject(new Error("Bridge closed before the wallet connected."));
      this.connectReject = null;
      this.connectResolve = null;
    }
    if (this.sigintHandler) {
      process.removeListener("SIGINT", this.sigintHandler);
      this.sigintHandler = null;
    }

    const server = this.server;
    this.server = null;
    if (server) {
      // Give the page a brief moment to receive the terminal poll response.
      await new Promise<void>(resolve => {
        setTimeout(() => {
          server.closeAllConnections?.();
          server.close(() => resolve());
        }, 50);
      });
    }
  }

  // --- HTTP handling -------------------------------------------------------

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    res.setHeader("Cache-Control", "no-store");

    if (!this.isValidHost(req.headers.host)) {
      res.statusCode = 403;
      res.end("Bad host");
      return;
    }

    const url = new URL(req.url ?? "/", this.origin);
    const path = url.pathname;

    if (path === "/" && req.method === "GET") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(BRIDGE_PAGE_HTML);
      return;
    }

    if (!path.startsWith("/api/")) {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }

    // Token auth for all API routes.
    if (!this.isValidToken(req.headers["x-bridge-token"])) {
      res.statusCode = 403;
      res.end("Forbidden");
      return;
    }

    // Origin check for PAGE-originated POSTs (anti DNS-rebinding). Client
    // routes (/api/enqueue, /api/shutdown) are exempt: a Node CLI client sends
    // no Origin header, and token-in-header already forces a CORS preflight for
    // any cross-site browser attempt (we emit no CORS headers, so it's blocked).
    if (req.method === "POST" && PAGE_POST_ROUTES.has(path)) {
      const origin = req.headers["origin"];
      if (origin !== this.origin) {
        res.statusCode = 403;
        res.end("Bad origin");
        return;
      }
    }

    if (path === "/api/session" && req.method === "GET") {
      this.json(res, {
        status: "ok",
        persistent: this.persistent,
        chain: {
          ...this.chain,
          chainIdHex: `0x${this.chain.chainId.toString(16)}`,
        },
      });
      return;
    }

    // --- Client (CLI) routes — persistent mode only -----------------------
    if (path === "/api/ping" && req.method === "GET") {
      this.json(res, {status: "ok"});
      return;
    }

    if (path === "/api/state" && req.method === "GET") {
      this.json(res, this.getState());
      return;
    }

    if (path === "/api/enqueue" && req.method === "POST") {
      if (!this.persistent) {
        res.statusCode = 404;
        res.end("Not found");
        return;
      }
      void this.readJson(req)
        .then(body => {
          try {
            const parsed = parseBridgeTx(body as SerializedBridgeTx);
            const id = this.enqueueTx(parsed);
            this.json(res, {id});
          } catch (err) {
            if (err instanceof EnqueueError) {
              res.statusCode = 409;
              this.json(res, {error: err.reason});
            } else {
              res.statusCode = 400;
              this.json(res, {error: (err as Error)?.message || "bad request"});
            }
          }
        })
        .catch(err => this.handleJsonReadError(res, err));
      return;
    }

    if (path === "/api/tx" && req.method === "GET") {
      const id = url.searchParams.get("id") ?? "";
      const rec = this.getTxResult(id);
      if (!rec) {
        res.statusCode = 404;
        this.json(res, {state: "unknown"});
        return;
      }
      this.json(res, rec);
      return;
    }

    if (path === "/api/shutdown" && req.method === "POST") {
      this.json(res, {status: "ok"});
      // Deterministic shutdown: if a daemon registered onShutdown, IT owns the
      // ordered teardown (remove descriptor → close bridge → exit) so the
      // "daemon exits ⇒ descriptor removed" invariant always holds — never rely
      // on unref'd polling. Only close directly when nobody orchestrates
      // (non-daemon / own-bridge usage).
      if (this.onShutdown) {
        this.onShutdown();
      } else {
        void this.close("Disconnected. You can close this tab.");
      }
      return;
    }

    if (path === "/api/connected" && req.method === "POST") {
      void this.readJson(req)
        .then(body => {
          const address = (body?.address ?? "") as Address;
          this.connectedAddress = address;
          if (this.connectTimer) {
            clearTimeout(this.connectTimer);
            this.connectTimer = null;
          }
          if (this.connectResolve) {
            this.connectResolve(address);
            this.connectResolve = null;
            this.connectReject = null;
          }
          this.onConnected?.(address);
          this.json(res, {status: "ok"});
        })
        .catch(err => this.handleJsonReadError(res, err));
      return;
    }

    if (path === "/api/next" && req.method === "GET") {
      this.handleNext(res);
      return;
    }

    if (path === "/api/result" && req.method === "POST") {
      void this.readJson(req)
        .then(body => {
          this.handleResult(body);
          this.json(res, {status: "ok"});
        })
        .catch(err => this.handleJsonReadError(res, err));
      return;
    }

    res.statusCode = 404;
    res.end("Not found");
  }

  private handleNext(res: http.ServerResponse): void {
    // Heartbeat: every page poll proves the tab is alive.
    this.lastPagePollAt = Date.now();

    // Deliver a queued-but-undelivered tx immediately.
    const pending = this.txQueue.find(p => !p.delivered);
    if (pending) {
      pending.delivered = true;
      if (this.resultStore.has(pending.request.id)) {
        this.resultStore.set(pending.request.id, {state: "delivered"});
      }
      this.json(res, {type: "tx", tx: this.serializeTx(pending.request)});
      return;
    }

    if (this.closed) {
      this.json(res, {type: "done", message: this.finalMessage});
      return;
    }

    // Long-poll: hold until a tx arrives or the poll window elapses.
    if (this.nextWaiter) {
      clearTimeout(this.nextWaiter.timer);
      this.nextWaiter.resolve({type: "none"});
      this.nextWaiter = null;
    }

    const timer = setTimeout(() => {
      if (this.nextWaiter) {
        this.nextWaiter = null;
        this.json(res, {type: "none"});
      }
    }, LONG_POLL_MS);

    this.nextWaiter = {
      resolve: payload => this.json(res, payload),
      timer,
    };
  }

  private handleResult(body: any): void {
    const id = body?.id as string;
    const pending = this.txQueue.find(p => p.request.id === id);
    if (!pending) return;

    const idx = this.txQueue.indexOf(pending);
    if (idx >= 0) this.txQueue.splice(idx, 1);
    if (pending.timer) clearTimeout(pending.timer);
    pending.from = typeof body?.from === "string" && body.from ? (body.from as Address) : undefined;
    if (pending.from) this.lastResultFrom.set(id, pending.from);

    const expectedSigner = pending.expectedSigner ?? this.connectedAddress ?? undefined;
    if (pending.from && expectedSigner && !sameAddress(pending.from, expectedSigner)) {
      pending.reject(
        new Error(
          `Wallet returned a result from ${pending.from}, but the expected signer is ${expectedSigner}. ` +
            "Switch back to the expected account or reconnect the wallet session.",
        ),
      );
      return;
    }
    if (pending.from && !expectedSigner) {
      pending.reject(
        new Error(
          `Wallet returned a result from ${pending.from}, but no connected signer was recorded for this session.`,
        ),
      );
      return;
    }

    if (body?.status === "sent" && body?.txHash) {
      pending.resolve(body.txHash as Hash);
    } else if (body?.status === "rejected") {
      pending.reject(new Error("Transaction rejected in wallet"));
    } else {
      pending.reject(new Error(body?.message || "Transaction failed in wallet"));
    }
  }

  private tryDeliverNext(): void {
    if (!this.nextWaiter) return;
    const pending = this.txQueue.find(p => !p.delivered);
    if (!pending) return;
    pending.delivered = true;
    if (this.resultStore.has(pending.request.id)) {
      this.resultStore.set(pending.request.id, {state: "delivered"});
    }
    const waiter = this.nextWaiter;
    this.nextWaiter = null;
    clearTimeout(waiter.timer);
    waiter.resolve({type: "tx", tx: this.serializeTx(pending.request)});
  }

  private serializeTx(tx: BridgeTxRequest): Record<string, unknown> {
    return {
      id: tx.id,
      // nonce/chainId are serialized for completeness but the page deliberately
      // does NOT forward them to eth_sendTransaction (MetaMask tracks its own
      // pending nonce and enforces the chain itself; some wallet versions reject
      // dapp-supplied nonce/chainId keys).
      ...serializeBridgeTx(tx),
      chainId: `0x${this.chain.chainId.toString(16)}`,
    };
  }

  private json(res: http.ServerResponse, payload: unknown): void {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify(payload));
  }

  private isValidHost(host: string | undefined): boolean {
    // Validate against the port captured at start() rather than the live
    // server address: a long-poll flushed during teardown is handled after the
    // server has closed (address() → null), and must still pass the check.
    const port = this.boundPort;
    return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
  }

  private isValidToken(header: string | string[] | undefined): boolean {
    if (typeof header !== "string") return false;
    const received = Buffer.from(header);
    const expected = Buffer.from(this.token);
    return received.length === expected.length && timingSafeEqual(received, expected);
  }

  private handleJsonReadError(res: http.ServerResponse, err: unknown): void {
    if (err instanceof PayloadTooLargeError) {
      res.statusCode = 413;
      res.end("Payload too large");
      return;
    }
    res.statusCode = 400;
    this.json(res, {error: "bad request"});
  }

  private readJson(req: http.IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let total = 0;
      let settled = false;
      req.on("data", c => {
        if (settled) return;
        const chunk = c as Buffer;
        total += chunk.length;
        if (total > MAX_JSON_BODY_BYTES) {
          settled = true;
          chunks.length = 0;
          reject(new PayloadTooLargeError());
          req.resume();
          return;
        }
        chunks.push(chunk);
      });
      req.on("end", () => {
        if (settled) return;
        settled = true;
        try {
          const raw = Buffer.concat(chunks).toString("utf-8");
          resolve(raw ? JSON.parse(raw) : {});
        } catch {
          resolve({});
        }
      });
      req.on("error", () => {
        if (settled) return;
        settled = true;
        resolve({});
      });
    });
  }
}
