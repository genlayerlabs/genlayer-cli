import http from "node:http";
import {randomUUID} from "node:crypto";
import type {AddressInfo} from "node:net";
import type {Address, Hash} from "genlayer-js/types";
import {openUrl as defaultOpenUrl} from "../clients/system";
import {BRIDGE_PAGE_HTML} from "./bridgePage";

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
  label: string;
}

export interface BrowserWalletBridgeOptions {
  chain: BridgeChainParams;
  openUrl?: (url: string) => Promise<unknown>;
  connectTimeoutMs?: number;
  txTimeoutMs?: number;
  log?: (msg: string) => void;
  /** Register a SIGINT handler that closes the server. Default: true. */
  handleSigint?: boolean;
}

interface PendingTx {
  request: BridgeTxRequest;
  resolve: (hash: Hash) => void;
  reject: (err: Error) => void;
  timer?: NodeJS.Timeout;
  delivered: boolean;
  from?: Address;
}

interface NextWaiter {
  resolve: (payload: unknown) => void;
  timer: NodeJS.Timeout;
}

const DEFAULT_CONNECT_TIMEOUT = 180_000;
const DEFAULT_TX_TIMEOUT = 300_000;
const LONG_POLL_MS = 25_000;

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

  private readonly token = randomUUID();
  private server: http.Server | null = null;
  private origin = "";
  private url = "";
  private closed = false;
  private finalMessage = "All done. You can close this tab.";

  private connectedAddress: Address | null = null;
  private connectResolve: ((addr: Address) => void) | null = null;
  private connectReject: ((err: Error) => void) | null = null;
  private connectTimer: NodeJS.Timeout | null = null;

  private readonly txQueue: PendingTx[] = [];
  private nextWaiter: NextWaiter | null = null;
  private sigintHandler: (() => void) | null = null;

  constructor(options: BrowserWalletBridgeOptions) {
    this.chain = options.chain;
    this.openUrl = options.openUrl ?? defaultOpenUrl;
    this.connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT;
    this.txTimeoutMs = options.txTimeoutMs ?? DEFAULT_TX_TIMEOUT;
    this.log = options.log ?? (() => {});
    this.handleSigint = options.handleSigint ?? true;
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
    this.origin = `http://127.0.0.1:${address.port}`;
    this.url = `${this.origin}/#s=${this.token}`;

    if (this.handleSigint) {
      this.sigintHandler = () => {
        void this.close("The CLI was interrupted.");
      };
      process.once("SIGINT", this.sigintHandler);
    }

    await this.openUrl(this.url).catch(() => {
      // Non-fatal: user can open the URL manually (headless / SSH).
    });

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
    const request: BridgeTxRequest = {...tx, id: randomUUID()};

    return new Promise<Hash>((resolve, reject) => {
      const pending: PendingTx = {
        request,
        resolve,
        reject,
        delivered: false,
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
    if (req.headers["x-bridge-token"] !== this.token) {
      res.statusCode = 403;
      res.end("Forbidden");
      return;
    }

    // Origin check for state-changing POSTs (anti DNS-rebinding).
    if (req.method === "POST") {
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
        chain: {
          ...this.chain,
          chainIdHex: `0x${this.chain.chainId.toString(16)}`,
        },
      });
      return;
    }

    if (path === "/api/connected" && req.method === "POST") {
      void this.readJson(req).then(body => {
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
        this.json(res, {status: "ok"});
      });
      return;
    }

    if (path === "/api/next" && req.method === "GET") {
      this.handleNext(res);
      return;
    }

    if (path === "/api/result" && req.method === "POST") {
      void this.readJson(req).then(body => {
        this.handleResult(body);
        this.json(res, {status: "ok"});
      });
      return;
    }

    res.statusCode = 404;
    res.end("Not found");
  }

  private handleNext(res: http.ServerResponse): void {
    // Deliver a queued-but-undelivered tx immediately.
    const pending = this.txQueue.find(p => !p.delivered);
    if (pending) {
      pending.delivered = true;
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
    pending.from = body?.from as Address | undefined;

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
    const waiter = this.nextWaiter;
    this.nextWaiter = null;
    clearTimeout(waiter.timer);
    waiter.resolve({type: "tx", tx: this.serializeTx(pending.request)});
  }

  private serializeTx(tx: BridgeTxRequest): Record<string, unknown> {
    return {
      id: tx.id,
      to: tx.to,
      data: tx.data,
      value: tx.value !== undefined ? `0x${tx.value.toString(16)}` : undefined,
      gasPrice: tx.gasPrice !== undefined ? `0x${tx.gasPrice.toString(16)}` : undefined,
      chainId: `0x${this.chain.chainId.toString(16)}`,
      label: tx.label,
    };
  }

  private json(res: http.ServerResponse, payload: unknown): void {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify(payload));
  }

  private readJson(req: http.IncomingMessage): Promise<any> {
    return new Promise(resolve => {
      const chunks: Buffer[] = [];
      req.on("data", c => chunks.push(c as Buffer));
      req.on("end", () => {
        try {
          const raw = Buffer.concat(chunks).toString("utf-8");
          resolve(raw ? JSON.parse(raw) : {});
        } catch {
          resolve({});
        }
      });
      req.on("error", () => resolve({}));
    });
  }
}
