import {BaseAction, resolveNetwork} from "../../lib/actions/BaseAction";
import type {GenLayerChain} from "genlayer-js/types";
import {WalletSessionClient} from "../../lib/wallet/sessionClient";
import {
  descriptorPath,
  readDescriptor,
  removeDescriptor,
  isPidAlive,
} from "../../lib/wallet/sessionDescriptor";
import {spawnWalletDaemon, waitForDaemonReady} from "../../lib/wallet/spawnDaemon";
import {runWalletSessionDaemon} from "../../lib/wallet/sessionDaemon";
import {DAEMON_LOG_FILENAME, HEARTBEAT_DEAD_MS, CONNECT_TIMEOUT_MS} from "../../lib/wallet/sessionConstants";

export interface WalletConnectOptions {
  network?: string;
  rpc?: string;
}

export class WalletAction extends BaseAction {
  private resolveChain(network?: string): GenLayerChain {
    return network
      ? {...resolveNetwork(network, this.getCustomNetworks())}
      : resolveNetwork(this.getConfig().network, this.getCustomNetworks());
  }

  private networkAlias(network?: string): string {
    return network ?? this.getConfig().network ?? "localnet";
  }

  /** `genlayer wallet connect` — start (or reuse) the persistent session. */
  async connect(options: WalletConnectOptions): Promise<void> {
    const chain = this.resolveChain(options.network);
    const alias = this.networkAlias(options.network);
    const dpath = descriptorPath(this);

    const existing = readDescriptor(dpath);
    if (existing && isPidAlive(existing.pid)) {
      const client = new WalletSessionClient(existing);
      if (await client.ping()) {
        const state = await client.state().catch(() => null);
        if (state && state.chainId === chain.id) {
          const tabDead =
            state.lastPagePollAt > 0 && Date.now() - state.lastPagePollAt > HEARTBEAT_DEAD_MS;
          if (tabDead) {
            // Daemon is alive and pinging, but its browser tab is gone (stale
            // page heartbeat). Reporting "Already connected" here would strand
            // the user — the next sign fails on the dead tab. Tear the stale
            // daemon down and start a fresh session so connect can recover.
            this.logInfo("Previous wallet tab was closed; starting a fresh session.");
            await client.shutdown();
            await this.waitForDescriptorGone(dpath, 5000);
          } else {
            if (state.connected && state.address) {
              this.logSuccess(`Already connected as ${state.address} on ${existing.network}.`);
            } else {
              this.logInfo(
                `A session is starting on ${existing.network}. Approve the connection in your browser.`,
              );
            }
            return;
          }
        } else {
          // Different chain → explicit switch: shut the old one down first.
          this.logInfo(
            `Switching wallet session from ${existing.network} (chain ${state?.chainId}) to ${alias} (chain ${chain.id}).`,
          );
          await client.shutdown();
          await this.waitForDescriptorGone(dpath, 5000);
        }
      } else {
        removeDescriptor(dpath);
      }
    } else if (existing) {
      removeDescriptor(dpath);
    }

    const logPath = this.getFilePath(DAEMON_LOG_FILENAME);
    this.startSpinner("Starting wallet session...");
    spawnWalletDaemon({network: options.network, rpc: options.rpc, logPath});
    const ready = await waitForDaemonReady(dpath, {logPath});
    this.stopSpinner();

    const client = new WalletSessionClient(ready);
    const state = await client.state();
    this.logInfo(`Open this URL in a browser with your wallet to connect:\n  ${state.url}`);
    this.logInfo("(Remote/SSH? Forward the port first: ssh -L <port>:127.0.0.1:<port> ...)");

    this.startSpinner("Waiting for wallet connection...");
    try {
      const address = await client.waitForConnection(CONNECT_TIMEOUT_MS);
      this.succeedSpinner(
        `Connected as ${address} on ${alias}. This session stays active; run 'genlayer wallet disconnect' to end it.`,
      );
    } catch (err) {
      this.failSpinner((err as Error)?.message || "Wallet did not connect.");
    }
  }

  /** `genlayer wallet status` — report the current session. */
  async status(): Promise<void> {
    const dpath = descriptorPath(this);
    const d = readDescriptor(dpath);
    if (!d) {
      this.logInfo("No active wallet session.");
      process.exitCode = 1;
      return;
    }
    const client = new WalletSessionClient(d);
    const alive = isPidAlive(d.pid) && (await client.ping());
    if (!alive) {
      this.logWarning("Wallet session descriptor is stale (daemon not reachable). Cleaning it up.");
      removeDescriptor(dpath);
      process.exitCode = 1;
      return;
    }
    const state = await client.state();
    const now = Date.now();
    const ageMin = Math.round((now - state.createdAt) / 60_000);
    const idleMin = Math.round((now - d.lastUsed) / 60_000);
    const heartbeatFresh = state.lastPagePollAt > 0 ? now - state.lastPagePollAt <= HEARTBEAT_DEAD_MS : true;

    this.log("Wallet session:", {
      status: state.connected ? "connected" : "connecting",
      address: state.address ?? "(not connected)",
      network: d.network,
      chainId: state.chainId,
      port: d.port,
      url: state.url,
      ageMinutes: ageMin,
      idleMinutes: idleMin,
      tabHeartbeat: heartbeatFresh ? "fresh" : "stale (tab may be closed)",
      queuedTransactions: state.queuedCount,
    });
    process.exitCode = state.connected ? 0 : 1;
  }

  /** `genlayer wallet disconnect` — shut the session down. */
  async disconnect(): Promise<void> {
    const dpath = descriptorPath(this);
    const d = readDescriptor(dpath);
    if (!d) {
      this.logInfo("No active wallet session.");
      return;
    }
    const client = new WalletSessionClient(d);
    await client.shutdown();

    // Wait briefly for the daemon to exit; otherwise SIGTERM it.
    const gone = await this.waitForPidGone(d.pid, 5000);
    if (!gone && isPidAlive(d.pid)) {
      try {
        process.kill(d.pid, "SIGTERM");
      } catch {
        // Already gone / not ours.
      }
    }
    removeDescriptor(dpath);
    this.logSuccess("Disconnected.");
  }

  /** Hidden entry point for the detached daemon process. */
  async daemon(options: WalletConnectOptions): Promise<void> {
    await runWalletSessionDaemon({
      network: options.network,
      rpc: options.rpc,
      configManager: this,
      log: (msg: string) => {
        // Daemon logs go to the redirected stdout (wallet-daemon.log).
        console.log(`[${new Date().toISOString()}] ${msg}`);
      },
    });
    // runWalletSessionDaemon installs its own timers/handlers and exits via
    // process.exit on its shutdown paths; nothing more to do here.
  }

  private async waitForDescriptorGone(dpath: string, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (readDescriptor(dpath) && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 100));
    }
  }

  private async waitForPidGone(pid: number, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (isPidAlive(pid) && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 100));
    }
    return !isPidAlive(pid);
  }
}
