import fs from "node:fs";
import type {ConfigFileManager} from "../config/ConfigFileManager";
import {SESSION_DESCRIPTOR_FILENAME} from "./sessionConstants";

/**
 * On-disk descriptor for a running wallet-session daemon. Written 0600 next to
 * the keystores in ~/.genlayer. Any CLI process reads it to discover the live
 * daemon and talk to it over token-authed localhost HTTP.
 */
export interface WalletSessionDescriptor {
  version: 1;
  pid: number;
  port: number;
  /** Bridge session token — same one the page carries in its URL fragment. */
  token: string;
  /** null until the wallet connects. */
  address: string | null;
  chainId: number;
  /** Network alias passed to resolveNetwork (or "custom"). */
  network: string;
  rpcUrl: string;
  createdAt: number;
  /** Updated by the daemon on every enqueue (throttled). */
  lastUsed: number;
}

export function descriptorPath(configManager: ConfigFileManager): string {
  return configManager.getFilePath(SESSION_DESCRIPTOR_FILENAME);
}

/**
 * Atomically write the descriptor with 0600 perms: write a temp file, then
 * rename over the target (rename is atomic on the same filesystem). chmod after
 * rename is belt-and-braces in case the tmp inherited a laxer umask.
 */
export function writeDescriptor(path: string, d: WalletSessionDescriptor): void {
  const tmp = `${path}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(d, null, 2), {mode: 0o600});
  fs.renameSync(tmp, path);
  try {
    fs.chmodSync(path, 0o600);
  } catch {
    // Non-fatal (e.g. exotic FS); the tmp already had 0600.
  }
}

function isValidDescriptor(v: any): v is WalletSessionDescriptor {
  return (
    v &&
    v.version === 1 &&
    typeof v.pid === "number" &&
    typeof v.port === "number" &&
    typeof v.token === "string" &&
    (v.address === null || typeof v.address === "string") &&
    typeof v.chainId === "number" &&
    typeof v.network === "string" &&
    typeof v.rpcUrl === "string" &&
    typeof v.createdAt === "number" &&
    typeof v.lastUsed === "number"
  );
}

/** Parse + schema-validate the descriptor, or return null (bad JSON / shape). */
export function readDescriptor(path: string): WalletSessionDescriptor | null {
  let raw: string;
  try {
    raw = fs.readFileSync(path, "utf-8");
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    return isValidDescriptor(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function removeDescriptor(path: string): void {
  fs.rmSync(path, {force: true});
}

/**
 * Cheap first-gate liveness check. Signal 0 does not kill; it only probes.
 * EPERM means the process exists but is owned by another user (still "alive").
 * The authoritative check is a token-authed /api/ping (handles PID/port reuse).
 */
export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e: any) {
    return e?.code === "EPERM";
  }
}
