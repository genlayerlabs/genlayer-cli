/**
 * Hermetic CLI-process fixture for the Tier-2 e2e lanes.
 *
 * Every command runs the built `dist/index.js` in a child process with a scratch
 * HOME, so the session descriptor + config file live under a throwaway
 * `<home>/.genlayer` and never touch the developer's real `~/.genlayer` or the
 * live network. The scratch config is seeded with a custom network whose
 * chain-id / rpc / staking address point at the ephemeral anvil, so
 * `ensureChain()` matches and `validator-join` targets the recording stub.
 */
import {spawn, type ChildProcess} from "node:child_process";
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, statSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {dirname} from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const CLI_ENTRY = join(REPO_ROOT, "dist", "index.js");

export const NETWORK_ALIAS = "anvil-e2e";

/** Short timing budgets so the error/tab-closed lanes resolve in seconds. */
export interface TimingOverrides {
  longPollMs?: number;
  heartbeatDeadMs?: number;
  connectTimeoutMs?: number;
}

export interface ScratchEnv {
  home: string;
  env: NodeJS.ProcessEnv;
  descriptorPath: string;
}

/**
 * Create a scratch HOME with a seeded config pointing at the given anvil chain.
 * The returned `env` is passed to every runCli/spawnConnect in the same test.
 */
export function makeScratchEnv(opts: {
  chainId: number;
  rpcUrl: string;
  stubAddress: `0x${string}`;
  walletMode?: "browser" | "keystore";
  timing?: TimingOverrides;
}): ScratchEnv {
  const home = mkdtempSync(join(tmpdir(), "gl-e2e-"));
  const genlayerDir = join(home, ".genlayer");
  mkdirSync(genlayerDir, {recursive: true});

  const config: Record<string, unknown> = {
    network: NETWORK_ALIAS,
    customNetworks: {
      [NETWORK_ALIAS]: {
        base: "localnet",
        overrides: {
          rpcUrl: opts.rpcUrl,
          chainId: opts.chainId,
          staking: opts.stubAddress,
        },
      },
    },
  };
  if (opts.walletMode) config.walletMode = opts.walletMode;
  writeFileSync(join(genlayerDir, "genlayer-config.json"), JSON.stringify(config, null, 2));

  const timing = opts.timing ?? {};
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: home,
    // Keep chalk/ora output plain so stdout scraping is reliable.
    NO_COLOR: "1",
    FORCE_COLOR: "0",
    // Never auto-open a real browser: the harness drives its own chromium.
    GENLAYER_E2E_NO_OPEN: "1",
  };
  if (timing.longPollMs) env.GENLAYER_E2E_LONG_POLL_MS = String(timing.longPollMs);
  if (timing.heartbeatDeadMs) env.GENLAYER_E2E_HEARTBEAT_DEAD_MS = String(timing.heartbeatDeadMs);
  if (timing.connectTimeoutMs) env.GENLAYER_E2E_CONNECT_TIMEOUT_MS = String(timing.connectTimeoutMs);

  return {home, env, descriptorPath: join(genlayerDir, "wallet-session.json")};
}

export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  all: string;
}

/** Run a CLI command to completion and capture its output + exit code. */
export function runCli(
  args: string[],
  scratch: ScratchEnv,
  opts: {timeoutMs?: number} = {},
): Promise<CliResult> {
  const timeoutMs = opts.timeoutMs ?? 60_000;
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [CLI_ENTRY, ...args], {env: scratch.env});
    let stdout = "";
    let stderr = "";
    let all = "";
    child.stdout.on("data", d => {
      stdout += d;
      all += d;
    });
    child.stderr.on("data", d => {
      stderr += d;
      all += d;
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`runCli timed out after ${timeoutMs}ms: ${args.join(" ")}\n${all}`));
    }, timeoutMs);
    child.once("error", err => {
      clearTimeout(timer);
      reject(err);
    });
    child.once("exit", code => {
      clearTimeout(timer);
      resolvePromise({exitCode: code ?? 0, stdout, stderr, all});
    });
  });
}

export interface ConnectHandle {
  child: ChildProcess;
  /** Resolves with the bridge session URL scraped from stdout. */
  waitForUrl(timeoutMs?: number): Promise<string>;
  /** Resolves when the connect command reports a successful connection. */
  waitForConnected(timeoutMs?: number): Promise<string>;
  kill(): void;
}

const URL_RE = /http:\/\/127\.0\.0\.1:\d+\/#s=[0-9a-fA-F-]+/;

/**
 * Spawn `wallet connect` (which blocks until the browser connects) and expose
 * hooks to scrape the printed session URL and await the "Connected as ..." line.
 */
export function spawnConnect(args: string[], scratch: ScratchEnv): ConnectHandle {
  const child = spawn(process.execPath, [CLI_ENTRY, "wallet", "connect", ...args], {env: scratch.env});
  let buf = "";
  const listeners: Array<(chunk: string) => void> = [];
  const onData = (d: Buffer) => {
    const s = d.toString();
    buf += s;
    for (const l of listeners) l(buf);
  };
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);

  const waitFor = (re: RegExp, label: string, timeoutMs: number): Promise<string> =>
    new Promise((resolvePromise, reject) => {
      const check = (text: string) => {
        const m = text.match(re);
        if (m) {
          const idx = listeners.indexOf(check as never);
          if (idx >= 0) listeners.splice(idx, 1);
          clearTimeout(timer);
          resolvePromise(m[0]);
          return true;
        }
        return false;
      };
      const timer = setTimeout(
        () => reject(new Error(`Timed out waiting for ${label}. Output so far:\n${buf}`)),
        timeoutMs,
      );
      child.once("exit", () => {
        if (!check(buf)) reject(new Error(`connect exited before ${label}. Output:\n${buf}`));
      });
      if (check(buf)) return;
      listeners.push(check as never);
    });

  return {
    child,
    waitForUrl: (timeoutMs = 30_000) => waitFor(URL_RE, "session URL", timeoutMs),
    waitForConnected: (timeoutMs = 30_000) =>
      waitFor(/Connected as (0x[0-9a-fA-F]{40})/, "connection", timeoutMs),
    kill: () => {
      try {
        child.kill("SIGKILL");
      } catch {
        // already gone
      }
    },
  };
}

// --- Descriptor / daemon inspection helpers ---------------------------------

export interface Descriptor {
  version: number;
  pid: number;
  port: number;
  token: string;
  address: string | null;
  chainId: number;
  network: string;
  rpcUrl: string;
  createdAt: number;
  lastUsed: number;
}

export function readDescriptor(scratch: ScratchEnv): Descriptor | null {
  if (!existsSync(scratch.descriptorPath)) return null;
  try {
    return JSON.parse(readFileSync(scratch.descriptorPath, "utf-8")) as Descriptor;
  } catch {
    return null;
  }
}

/** Octal file mode (e.g. 0o600 → 384) of the descriptor, or null if absent. */
export function descriptorMode(scratch: ScratchEnv): number | null {
  if (!existsSync(scratch.descriptorPath)) return null;
  return statSync(scratch.descriptorPath).mode & 0o777;
}

export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e: unknown) {
    return (e as {code?: string})?.code === "EPERM";
  }
}

/** Authenticated GET against the running daemon (127.0.0.1:<port>). */
export async function daemonGet(
  descriptor: Descriptor,
  path: string,
): Promise<{status: number; body: unknown}> {
  const res = await fetch(`http://127.0.0.1:${descriptor.port}${path}`, {
    headers: {"X-Bridge-Token": descriptor.token},
  });
  const body = await res.json().catch(() => ({}));
  return {status: res.status, body};
}

/** Poll until a predicate holds or the deadline passes. */
export async function waitUntil(
  predicate: () => boolean | Promise<boolean>,
  opts: {timeoutMs?: number; intervalMs?: number} = {},
): Promise<boolean> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const intervalMs = opts.intervalMs ?? 100;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await predicate()) return true;
    if (Date.now() > deadline) return false;
    await new Promise(r => setTimeout(r, intervalMs));
  }
}
