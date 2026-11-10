import type {GenLayerChain} from "genlayer-js/types";
import type {ConfigFileManager} from "../config/ConfigFileManager";
import {openBrowserWalletSession, openRemoteWalletSession, type BrowserSession} from "./browserSend";
import {WalletSessionClient} from "./sessionClient";
import {descriptorPath, readDescriptor, removeDescriptor, isPidAlive} from "./sessionDescriptor";
import {spawnWalletDaemon, waitForDaemonReady} from "./spawnDaemon";
import {
  DAEMON_LOG_FILENAME,
  CONNECT_TIMEOUT_MS,
  HEARTBEAT_DEAD_MS,
  TAB_CLOSED_MESSAGE,
} from "./sessionConstants";

export type SessionFallback = "auto-start" | "own-bridge" | "error";

export interface ResolveSessionParams {
  /** Already-resolved chain (network flag > config). */
  chain: GenLayerChain;
  rpcUrl: string;
  /** Network alias for the descriptor / daemon argv. */
  networkAlias?: string;
  configManager: ConfigFileManager;
  fallback: SessionFallback;
  log?: (msg: string) => void;
  logInfo?: (msg: string) => void;
  logWarning?: (msg: string) => void;
  openUrl?: (url: string) => Promise<unknown>;
  handleSigint?: boolean;
  // Test seams.
  spawnFn?: Parameters<typeof spawnWalletDaemon>[0]["spawnFn"];
  fetchFn?: typeof fetch;
  /** Override daemon-ready poll timeout (tests). */
  readyTimeoutMs?: number;
}

/**
 * The single entry point every browser-mode command uses. Finds a live daemon
 * session and returns a remote session bound to it; otherwise applies the
 * fallback (auto-start a persistent daemon, open an own in-process bridge, or
 * error). Stale descriptors are cleaned up transparently.
 */
export async function resolveBrowserWalletSession(params: ResolveSessionParams): Promise<BrowserSession> {
  const {chain, rpcUrl, configManager} = params;
  const log = params.log ?? (() => {});
  const logInfo = params.logInfo ?? (() => {});
  const logWarning = params.logWarning ?? (() => {});
  const dpath = descriptorPath(configManager);

  // 1. Discover.
  const descriptor = readDescriptor(dpath);
  if (descriptor) {
    // 2. Liveness (cheap pid gate, then authoritative ping).
    const client = new WalletSessionClient(descriptor, {fetchFn: params.fetchFn});
    const alive = isPidAlive(descriptor.pid) && (await client.ping());
    if (!alive) {
      removeDescriptor(dpath); // stale cleanup
    } else {
      // 3. Live session found.
      let state = await client.state();
      if (state.chainId !== chain.id) {
        throw new Error(
          `Browser wallet session is connected to ${descriptor.network} (chain ${state.chainId}) ` +
            `but this command targets ${chain.name} (chain ${chain.id}). ` +
            `Run 'genlayer wallet connect --network ${params.networkAlias ?? descriptor.network}' to switch, ` +
            `or pass --wallet keystore.`,
        );
      }
      if (!state.connected) {
        await client.waitForConnection(CONNECT_TIMEOUT_MS);
        // Re-read: a just-connected page has polled, so its heartbeat is fresh.
        state = await client.state();
      }
      // Fail fast on a dead tab (stale page heartbeat) instead of returning a
      // session that only fails at the final sign step. The daemon self-manages
      // its own tab-dead shutdown, so we do not touch the descriptor here — just
      // surface the reconnect instruction immediately. lastPagePollAt === 0
      // means the page has never polled yet (freshly started) → not stale.
      if (state.lastPagePollAt > 0 && Date.now() - state.lastPagePollAt > HEARTBEAT_DEAD_MS) {
        throw new Error(TAB_CLOSED_MESSAGE);
      }
      return openRemoteWalletSession({client, chain, rpcUrl, log, logInfo});
    }
  }

  // 4. No live session — apply the fallback.
  if (params.fallback === "error") {
    throw new Error("No active browser wallet session. Run 'genlayer wallet connect' first.");
  }

  if (params.fallback === "auto-start") {
    try {
      const logPath = configManager.getFilePath(DAEMON_LOG_FILENAME);
      spawnWalletDaemon({
        network: params.networkAlias,
        rpc: rpcUrl,
        logPath,
        spawnFn: params.spawnFn,
      });
      const ready = await waitForDaemonReady(dpath, {
        logPath,
        fetchFn: params.fetchFn,
        timeoutMs: params.readyTimeoutMs,
      });
      logInfo(
        "Started a persistent wallet session — approve the connection in your browser. " +
          "Subsequent commands will reuse it; end it with 'genlayer wallet disconnect'.",
      );
      const client = new WalletSessionClient(ready, {fetchFn: params.fetchFn});
      await client.waitForConnection(CONNECT_TIMEOUT_MS);
      return openRemoteWalletSession({client, chain, rpcUrl, log, logInfo});
    } catch (err) {
      // Degrade to an own in-process bridge (e.g. weird packaging where re-exec
      // fails). A lone command still works exactly like before.
      logWarning(
        `Could not start a persistent wallet session (${
          (err as Error)?.message || err
        }). Falling back to a single-use bridge for this command.`,
      );
    }
  }

  // own-bridge (explicit, or degraded auto-start).
  return openBrowserWalletSession({
    chain,
    rpcUrl,
    log,
    logInfo,
    openUrl: params.openUrl,
    handleSigint: params.handleSigint,
  });
}
