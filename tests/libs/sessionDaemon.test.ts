import {describe, test, expect, beforeEach, afterEach, vi} from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {ConfigFileManager} from "../../src/lib/config/ConfigFileManager";
import {runWalletSessionDaemon, type DaemonHandle} from "../../src/lib/wallet/sessionDaemon";
import {descriptorPath, readDescriptor} from "../../src/lib/wallet/sessionDescriptor";

const ADDRESS = "0xConnected0000000000000000000000000000001" as `0x${string}`;

describe("runWalletSessionDaemon", () => {
  let dir: string;
  let cfg: ConfigFileManager;
  let openUrl: ReturnType<typeof vi.fn>;
  let handles: DaemonHandle[];

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "gl-daemon-"));
    // ConfigFileManager resolves baseFolder against os.homedir(), but an
    // absolute path wins (path.resolve semantics), so the temp dir is used as-is.
    cfg = new ConfigFileManager(dir);
    cfg.writeConfig("network", "localnet");
    openUrl = vi.fn().mockResolvedValue(undefined);
    handles = [];
  });

  afterEach(async () => {
    await Promise.all(handles.map(h => h.dispose().catch(() => {})));
    fs.rmSync(dir, {recursive: true, force: true});
  });

  async function run(overrides: Partial<Parameters<typeof runWalletSessionDaemon>[0]> = {}) {
    const handle = await runWalletSessionDaemon({
      configManager: cfg,
      openUrl,
      onExit: () => {}, // never kill the test runner
      log: () => {},
      ...overrides,
    });
    handles.push(handle);
    return handle;
  }

  test("writes a descriptor only after listening; opens the tab", async () => {
    const h = await run();
    const dpath = descriptorPath(cfg);
    const d = readDescriptor(dpath);
    expect(d).not.toBeNull();
    expect(d!.pid).toBe(process.pid);
    expect(d!.port).toBeGreaterThan(0);
    expect(d!.address).toBeNull();
    expect(openUrl).toHaveBeenCalledOnce();
  });

  test("onConnected rewrites the descriptor address", async () => {
    const h = await run();
    const {origin, token} = parse(h.bridge.getUrl());
    await fetch(`${origin}/api/connected`, {
      method: "POST",
      headers: {"X-Bridge-Token": token, "Content-Type": "application/json", Origin: origin},
      body: JSON.stringify({address: ADDRESS}),
    });
    // onConnected is synchronous inside the handler; give the microtask a beat.
    await new Promise(r => setTimeout(r, 20));
    expect(readDescriptor(descriptorPath(cfg))!.address).toBe(ADDRESS);
  });

  test("idle TTL exit removes the descriptor", async () => {
    const exit = vi.fn();
    const h = await run({idleTtlMs: 1, onExit: exit});
    await new Promise(r => setTimeout(r, 5));
    h.tick();
    await new Promise(r => setTimeout(r, 50)); // cleanupAndExit is async (awaits bridge.close)
    expect(exit).toHaveBeenCalledWith(0);
    expect(readDescriptor(descriptorPath(cfg))).toBeNull();
  });

  test("tab-dead exit after connecting then going silent", async () => {
    const exit = vi.fn();
    const h = await run({tabDeadGraceMs: 1, connectTimeoutMs: 60_000, idleTtlMs: 60_000, onExit: exit});
    const {origin, token} = parse(h.bridge.getUrl());
    await fetch(`${origin}/api/connected`, {
      method: "POST",
      headers: {"X-Bridge-Token": token, "Content-Type": "application/json", Origin: origin},
      body: JSON.stringify({address: ADDRESS}),
    });
    // One poll to set a heartbeat, then rewind it.
    void fetch(`${origin}/api/next`, {headers: {"X-Bridge-Token": token}}).catch(() => {});
    await new Promise(r => setTimeout(r, 20));
    (h.bridge as any).lastPagePollAt = Date.now() - 10 * 60_000;
    h.tick();
    await new Promise(r => setTimeout(r, 50));
    expect(exit).toHaveBeenCalledWith(0);
    expect(readDescriptor(descriptorPath(cfg))).toBeNull();
  });

  test("connect timeout exit when nobody connects", async () => {
    const exit = vi.fn();
    const h = await run({connectTimeoutMs: 1, idleTtlMs: 60_000, onExit: exit});
    await new Promise(r => setTimeout(r, 5));
    h.tick();
    await new Promise(r => setTimeout(r, 50));
    expect(exit).toHaveBeenCalledWith(0);
    expect(readDescriptor(descriptorPath(cfg))).toBeNull();
  });

  test("second daemon defers to a live one (singleton guard)", async () => {
    await run(); // first daemon writes a live descriptor
    const exit = vi.fn();
    await expect(
      runWalletSessionDaemon({configManager: cfg, openUrl, onExit: exit, log: () => {}}),
    ).rejects.toThrow(/already-running/);
    expect(exit).toHaveBeenCalledWith(0);
  });

  test("/api/shutdown → descriptor removed + exit(0) (deterministic, no unref polling)", async () => {
    const exit = vi.fn();
    const h = await run({idleTtlMs: 60_000, connectTimeoutMs: 60_000, onExit: exit});
    expect(readDescriptor(descriptorPath(cfg))).not.toBeNull();

    const {origin, token} = parse(h.bridge.getUrl());
    // POST /api/shutdown as a CLI client would (no Origin header).
    const res = await fetch(`${origin}/api/shutdown`, {
      method: "POST",
      headers: {"X-Bridge-Token": token, "Content-Type": "application/json"},
    });
    expect(res.status).toBe(200);

    // onShutdown → cleanupAndExit runs the ordered teardown synchronously enough;
    // give the awaited bridge.close a beat.
    await new Promise(r => setTimeout(r, 100));
    // The invariant: daemon exited AND the descriptor is gone.
    expect(exit).toHaveBeenCalledWith(0);
    expect(readDescriptor(descriptorPath(cfg))).toBeNull();
  });

  function parse(url: string) {
    const u = new URL(url);
    return {origin: `${u.protocol}//${u.host}`, token: new URLSearchParams(u.hash.slice(1)).get("s")!};
  }
});
