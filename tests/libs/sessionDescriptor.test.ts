import {describe, test, expect, beforeEach, afterEach} from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  writeDescriptor,
  readDescriptor,
  removeDescriptor,
  isPidAlive,
  descriptorPath,
  type WalletSessionDescriptor,
} from "../../src/lib/wallet/sessionDescriptor";

function makeDescriptor(overrides: Partial<WalletSessionDescriptor> = {}): WalletSessionDescriptor {
  return {
    version: 1,
    pid: process.pid,
    port: 51234,
    token: "tok-123",
    address: null,
    chainId: 4221,
    network: "testnet-bradbury",
    rpcUrl: "https://rpc.example",
    createdAt: 1000,
    lastUsed: 1000,
    ...overrides,
  };
}

describe("sessionDescriptor", () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "gl-session-"));
    file = path.join(dir, "wallet-session.json");
  });

  afterEach(() => {
    fs.rmSync(dir, {recursive: true, force: true});
  });

  test("descriptorPath resolves against the config manager folder", () => {
    const fake = {getFilePath: (n: string) => path.join("/home/x/.genlayer", n)} as any;
    expect(descriptorPath(fake)).toBe("/home/x/.genlayer/wallet-session.json");
  });

  test("writeDescriptor writes 0600 and readDescriptor round-trips", () => {
    const d = makeDescriptor();
    writeDescriptor(file, d);
    const mode = fs.statSync(file).mode & 0o777;
    expect(mode).toBe(0o600);
    expect(readDescriptor(file)).toEqual(d);
    // No leftover temp file.
    expect(fs.existsSync(`${file}.tmp`)).toBe(false);
  });

  test("writeDescriptor overwrites atomically (existing file replaced)", () => {
    writeDescriptor(file, makeDescriptor({port: 1}));
    writeDescriptor(file, makeDescriptor({port: 2}));
    expect(readDescriptor(file)!.port).toBe(2);
  });

  test("readDescriptor returns null for a missing file", () => {
    expect(readDescriptor(path.join(dir, "nope.json"))).toBeNull();
  });

  test("readDescriptor returns null for garbage JSON", () => {
    fs.writeFileSync(file, "not json{");
    expect(readDescriptor(file)).toBeNull();
  });

  test("readDescriptor returns null for wrong version / bad shape", () => {
    fs.writeFileSync(file, JSON.stringify({version: 2, pid: 1}));
    expect(readDescriptor(file)).toBeNull();
    fs.writeFileSync(file, JSON.stringify({...makeDescriptor(), token: 123}));
    expect(readDescriptor(file)).toBeNull();
  });

  test("removeDescriptor deletes and is idempotent", () => {
    writeDescriptor(file, makeDescriptor());
    removeDescriptor(file);
    expect(fs.existsSync(file)).toBe(false);
    // No throw on a second removal.
    expect(() => removeDescriptor(file)).not.toThrow();
  });

  test("isPidAlive: own pid alive, an impossibly-high pid dead", () => {
    expect(isPidAlive(process.pid)).toBe(true);
    // 2^30-ish pid will not exist on any real system.
    expect(isPidAlive(0x3fffffff)).toBe(false);
  });
});
