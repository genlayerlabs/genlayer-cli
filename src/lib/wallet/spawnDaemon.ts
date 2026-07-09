import fs from "node:fs";
import {spawn, type SpawnOptions} from "node:child_process";
import {readDescriptor, isPidAlive, type WalletSessionDescriptor} from "./sessionDescriptor";
import {WalletSessionClient} from "./sessionClient";
import {DAEMON_READY_TIMEOUT_MS} from "./sessionConstants";

type SpawnFn = (command: string, args: readonly string[], options: SpawnOptions) => {pid?: number; unref(): void};

export interface SpawnDaemonParams {
  /** Network alias; omitted → daemon uses config network. */
  network?: string;
  rpc?: string;
  /** Default process.argv[1]; injectable for tests. */
  cliPath?: string;
  /** Default process.execPath; injectable for tests. */
  execPath?: string;
  /** Daemon log path (configManager.getFilePath("wallet-daemon.log")). */
  logPath: string;
  /** Injectable spawn for tests. */
  spawnFn?: SpawnFn;
}

/**
 * Detach-spawn the daemon by re-exec'ing this same bundled CLI with the hidden
 * `wallet daemon` subcommand. Re-exec (rather than pointing at a separate entry
 * file) is the only mechanism that works uniformly for global installs, npx,
 * and `node dist/index.js`, with zero esbuild config changes.
 *
 * The token is NEVER placed on argv (visible in `ps`); the daemon generates it
 * itself and publishes it only via the 0600 descriptor file.
 */
export function spawnWalletDaemon(p: SpawnDaemonParams): number {
  const execPath = p.execPath ?? process.execPath;
  const cliPath = p.cliPath ?? process.argv[1];
  const spawnFn = p.spawnFn ?? (spawn as unknown as SpawnFn);

  const out = fs.openSync(p.logPath, "a");
  try {
    fs.chmodSync(p.logPath, 0o600);
  } catch {
    // Non-fatal.
  }

  const args = [cliPath, "wallet", "daemon"];
  if (p.network) args.push("--network", p.network);
  if (p.rpc) args.push("--rpc", p.rpc);

  const child = spawnFn(execPath, args, {
    detached: true,
    stdio: ["ignore", out, out],
    windowsHide: true,
    env: process.env,
  });
  child.unref();
  fs.closeSync(out);

  if (!child.pid) {
    throw new Error("Failed to spawn the wallet-session daemon (no pid).");
  }
  return child.pid;
}

/**
 * Poll until the descriptor exists, its pid is live, and its /api/ping answers
 * with the token. On timeout, surface the tail of the daemon log to aid debugging.
 */
export async function waitForDaemonReady(
  descriptorPath: string,
  opts: {
    timeoutMs?: number;
    logPath?: string;
    fetchFn?: typeof fetch;
    intervalMs?: number;
  } = {},
): Promise<WalletSessionDescriptor> {
  const timeoutMs = opts.timeoutMs ?? DAEMON_READY_TIMEOUT_MS;
  const intervalMs = opts.intervalMs ?? 200;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const d = readDescriptor(descriptorPath);
    if (d && isPidAlive(d.pid)) {
      const client = new WalletSessionClient(d, {fetchFn: opts.fetchFn});
      if (await client.ping()) return d;
    }
    if (Date.now() > deadline) {
      let tail = "";
      if (opts.logPath) {
        try {
          const log = fs.readFileSync(opts.logPath, "utf-8");
          tail = "\n" + log.split("\n").slice(-15).join("\n");
        } catch {
          // ignore
        }
      }
      throw new Error(`Wallet-session daemon did not become ready within ${timeoutMs}ms.${tail}`);
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
}
