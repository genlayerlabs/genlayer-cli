import type {Address} from "genlayer-js/types";
import type {ConfigFileManager} from "../config/ConfigFileManager";
import {resolveNetwork} from "../actions/BaseAction";
import {normalizeCustomNetworks, CUSTOM_NETWORKS_CONFIG_KEY} from "../networks/customNetworks";
import {BrowserWalletBridge} from "./browserBridge";
import {buildBridgeChain} from "./browserSend";
import {
  descriptorPath,
  readDescriptor,
  removeDescriptor,
  writeDescriptor,
  isPidAlive,
  type WalletSessionDescriptor,
} from "./sessionDescriptor";
import {WalletSessionClient} from "./sessionClient";
import {
  IDLE_TTL_MS,
  TAB_DEAD_GRACE_MS,
  CONNECT_TIMEOUT_MS,
  WALLET_SESSION_TTL_CONFIG_KEY,
} from "./sessionConstants";

export interface RunDaemonOptions {
  network?: string;
  rpc?: string;
  configManager: ConfigFileManager;
  openUrl?: (url: string) => Promise<unknown>;
  idleTtlMs?: number;
  tabDeadGraceMs?: number;
  connectTimeoutMs?: number;
  /** Injectable for tests — avoids process.exit killing the test runner. */
  onExit?: (code: number) => void;
  log?: (msg: string) => void;
  /** For tests: resolve as soon as the runtime is set up (bridge listening + descriptor written). */
  onReady?: (ctx: DaemonHandle) => void;
}

export interface DaemonHandle {
  bridge: BrowserWalletBridge;
  descriptor: WalletSessionDescriptor;
  /** Force one timer tick (tests). */
  tick(): void;
  /** Stop timers + close the bridge without exiting the process (tests). */
  dispose(): Promise<void>;
}

const LAST_USED_THROTTLE_MS = 5000;

/**
 * The persistent wallet-session daemon runtime. Owns the bridge server + browser
 * tab + descriptor file lifecycle. Self-terminates on idle TTL, sustained tab
 * silence, /api/shutdown, connect timeout, or a fatal signal — always removing
 * the descriptor first.
 */
export async function runWalletSessionDaemon(opts: RunDaemonOptions): Promise<DaemonHandle> {
  const {configManager} = opts;
  const log = opts.log ?? (() => {});
  const exit = opts.onExit ?? ((code: number) => process.exit(code));

  const idleTtlMs = resolveIdleTtl(configManager, opts.idleTtlMs);
  const tabDeadGraceMs = opts.tabDeadGraceMs ?? TAB_DEAD_GRACE_MS;
  const connectTimeoutMs = opts.connectTimeoutMs ?? CONNECT_TIMEOUT_MS;

  const dpath = descriptorPath(configManager);

  // Singleton guard: an already-live daemon wins.
  const existing = readDescriptor(dpath);
  if (existing && isPidAlive(existing.pid)) {
    const client = new WalletSessionClient(existing);
    if (await client.ping()) {
      log(`Wallet session already running (pid ${existing.pid}). Exiting.`);
      exit(0);
      throw new Error("daemon-already-running");
    }
  }
  if (existing) removeDescriptor(dpath);

  // Resolve chain exactly like BaseAction.getBrowserSession.
  const customNetworks = normalizeCustomNetworks(configManager.getConfigByKey(CUSTOM_NETWORKS_CONFIG_KEY));
  const networkAlias = opts.network || configManager.getConfigByKey("network") || "localnet";
  const chain = opts.network
    ? {...resolveNetwork(opts.network, customNetworks)}
    : resolveNetwork(configManager.getConfigByKey("network"), customNetworks);
  const rpcUrl = opts.rpc || chain.rpcUrls.default.http[0];

  const bridgeChain = buildBridgeChain(chain, rpcUrl);

  let lastUsedWrite = 0;
  let disposed = false;
  // Forward reference: cleanupAndExit is defined after the bridge is built, but
  // /api/shutdown must trigger it deterministically. The bridge calls this thunk
  // synchronously from the shutdown handler.
  let onShutdownCb: (() => void) | undefined;

  const bridge = new BrowserWalletBridge({
    chain: bridgeChain,
    persistent: true,
    handleSigint: false, // the daemon installs its own signal handling below
    onShutdown: () => onShutdownCb?.(),
    openUrl: opts.openUrl,
    log,
    onConnected: (address: Address) => {
      const d = readDescriptor(dpath);
      if (d) writeDescriptor(dpath, {...d, address});
      log(`Wallet connected: ${address}`);
    },
    onActivity: () => {
      const now = Date.now();
      if (now - lastUsedWrite < LAST_USED_THROTTLE_MS) return;
      lastUsedWrite = now;
      const d = readDescriptor(dpath);
      if (d) writeDescriptor(dpath, {...d, lastUsed: now});
    },
    connectTimeoutMs,
  });

  await bridge.start();

  // Write the descriptor ONLY after listening succeeds, so a readable
  // descriptor always implies a live port.
  const now = Date.now();
  const descriptor: WalletSessionDescriptor = {
    version: 1,
    pid: process.pid,
    port: bridge.getPort(),
    token: bridge.getToken(),
    address: null,
    chainId: chain.id,
    network: networkAlias,
    rpcUrl,
    createdAt: now,
    lastUsed: now,
  };
  writeDescriptor(dpath, descriptor);
  log(`Wallet session started (pid ${process.pid}, port ${descriptor.port}). URL: ${bridge.getUrl()}`);

  let everConnected = false;
  let cleaned = false;

  const cleanupAndExit = async (code: number, finalMessage?: string): Promise<void> => {
    if (cleaned) return;
    cleaned = true;
    clearInterval(timer);
    removeDescriptor(dpath);
    await bridge.close(finalMessage).catch(() => {});
    exit(code);
  };

  const checkTimers = (): void => {
    if (cleaned || disposed) return;
    const state = bridge.getState();
    if (state.connected) everConnected = true;

    const d = readDescriptor(dpath);
    const lastUsed = d ? Math.max(d.lastUsed, d.createdAt) : descriptor.createdAt;

    // Idle TTL.
    if (Date.now() - lastUsed > idleTtlMs) {
      log("Idle TTL reached — shutting down.");
      void cleanupAndExit(
        0,
        "Session expired after inactivity. Run 'genlayer wallet connect' to start a new one.",
      );
      return;
    }

    // Tab-dead: connected once, but the page heartbeat went silent.
    if (everConnected && state.lastPagePollAt > 0 && Date.now() - state.lastPagePollAt > tabDeadGraceMs) {
      log("Tab heartbeat lost — shutting down.");
      void cleanupAndExit(0, "The wallet tab was closed. Run 'genlayer wallet connect' to start a new one.");
      return;
    }

    // Connect timeout: never connected within the window → no zombie daemons.
    if (!everConnected && Date.now() - descriptor.createdAt > connectTimeoutMs) {
      log("Connect timeout — nobody connected. Shutting down.");
      void cleanupAndExit(0, "No wallet connected in time.");
      return;
    }
  };

  // /api/shutdown (via wallet disconnect) → deterministic ordered teardown.
  // Wired here (not via unref'd polling): the bridge fires onShutdown, which
  // removes the descriptor, closes the bridge, then exits — so the invariant
  // "daemon process gone ⇒ descriptor removed" always holds.
  onShutdownCb = () => void cleanupAndExit(0, "Disconnected. You can close this tab.");

  // NOT unref'd: the interval keeps the event loop alive so the daemon only
  // ever exits through cleanupAndExit (idle/tab-dead/connect-timeout/shutdown/
  // signal), never by the loop draining after the server socket closes.
  const timer = setInterval(checkTimers, 30_000);

  // Signal + fatal-error handling: always remove the descriptor first.
  const onSignal = (sig: string) => () => {
    log(`Received ${sig} — shutting down.`);
    void cleanupAndExit(0);
  };
  const sigHandlers: Record<string, () => void> = {};
  if (opts.onExit === undefined) {
    for (const sig of ["SIGTERM", "SIGINT", "SIGHUP"] as const) {
      const h = onSignal(sig);
      sigHandlers[sig] = h;
      process.once(sig, h);
    }
    process.once("uncaughtException", err => {
      log(`uncaughtException: ${err instanceof Error ? err.stack : String(err)}`);
      void cleanupAndExit(1);
    });
    process.once("unhandledRejection", reason => {
      log(`unhandledRejection: ${String(reason)}`);
      void cleanupAndExit(1);
    });
  }

  const handle: DaemonHandle = {
    bridge,
    descriptor,
    tick: checkTimers,
    dispose: async () => {
      disposed = true;
      clearInterval(timer);
      for (const [sig, h] of Object.entries(sigHandlers)) process.removeListener(sig, h);
      removeDescriptor(dpath);
      await bridge.close().catch(() => {});
    },
  };

  opts.onReady?.(handle);
  return handle;
}

function resolveIdleTtl(configManager: ConfigFileManager, override?: number): number {
  if (override !== undefined) return override;
  const configured = configManager.getConfigByKey(WALLET_SESSION_TTL_CONFIG_KEY);
  const minutes = Number(configured);
  if (Number.isFinite(minutes) && minutes > 0) return minutes * 60_000;
  return IDLE_TTL_MS;
}
