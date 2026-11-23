import {describe, test, expect, beforeEach, afterEach, vi} from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnWalletDaemon, waitForDaemonReady} from "../../src/lib/wallet/spawnDaemon";
import {BrowserWalletBridge} from "../../src/lib/wallet/browserBridge";
import {writeDescriptor, type WalletSessionDescriptor} from "../../src/lib/wallet/sessionDescriptor";

describe("spawnWalletDaemon", () => {
  let dir: string;
  let logPath: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "gl-spawn-"));
    logPath = path.join(dir, "wallet-daemon.log");
  });
  afterEach(() => fs.rmSync(dir, {recursive: true, force: true}));

  test("re-execs execPath + argv[1] with 'wallet daemon' and network, detached + unref", () => {
    const unref = vi.fn();
    const spawnFn = vi.fn().mockReturnValue({pid: 4242, unref});
    const pid = spawnWalletDaemon({
      network: "testnet-bradbury",
      rpc: "https://rpc.example",
      cliPath: "/x/dist/index.js",
      execPath: "/usr/bin/node",
      logPath,
      spawnFn,
    });
    expect(pid).toBe(4242);
    expect(unref).toHaveBeenCalledOnce();
    const [cmd, args, options] = spawnFn.mock.calls[0];
    expect(cmd).toBe("/usr/bin/node");
    expect(args).toEqual([
      "/x/dist/index.js",
      "wallet",
      "daemon",
      "--network",
      "testnet-bradbury",
      "--rpc",
      "https://rpc.example",
    ]);
    expect(options.detached).toBe(true);
    expect(options.windowsHide).toBe(true);
  });

  test("throws when spawn returns no pid", () => {
    const spawnFn = vi.fn().mockReturnValue({pid: undefined, unref: vi.fn()});
    expect(() => spawnWalletDaemon({logPath, spawnFn})).toThrow(/no pid/i);
  });
});

describe("waitForDaemonReady", () => {
  let dir: string;
  let dpath: string;
  let bridge: BrowserWalletBridge;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "gl-ready-"));
    dpath = path.join(dir, "wallet-session.json");
  });
  afterEach(async () => {
    await bridge?.close().catch(() => {});
    fs.rmSync(dir, {recursive: true, force: true});
  });

  test("resolves once the descriptor is live and pings", async () => {
    bridge = new BrowserWalletBridge({
      chain: {
        chainId: 1,
        chainName: "x",
        rpcUrls: ["r"],
        nativeCurrency: {name: "n", symbol: "s", decimals: 18},
      },
      handleSigint: false,
      persistent: true,
      // Mocked — never call the real `open` (would pop/orphan a browser tab).
      openUrl: async () => undefined,
    });
    const {url} = await bridge.start();
    const u = new URL(url);
    const d: WalletSessionDescriptor = {
      version: 1,
      pid: process.pid,
      port: Number(u.port),
      token: new URLSearchParams(u.hash.slice(1)).get("s")!,
      address: null,
      chainId: 1,
      network: "localnet",
      rpcUrl: "r",
      createdAt: Date.now(),
      lastUsed: Date.now(),
    };
    writeDescriptor(dpath, d);
    await expect(waitForDaemonReady(dpath, {timeoutMs: 2000, intervalMs: 20})).resolves.toMatchObject({
      port: d.port,
    });
  });

  test("times out with a log tail when nothing becomes ready", async () => {
    fs.writeFileSync(path.join(dir, "wallet-daemon.log"), "line1\nboom: failed to bind\n");
    await expect(
      waitForDaemonReady(dpath, {
        timeoutMs: 150,
        intervalMs: 30,
        logPath: path.join(dir, "wallet-daemon.log"),
      }),
    ).rejects.toThrow(/did not become ready[\s\S]*boom: failed to bind/);
  });
});

// NOTE: There is deliberately NO real-process / real-browser end-to-end test
// here. Automated tests must never spawn a detached daemon or call the real
// openUrl (that would pop a browser and can orphan tabs/processes). The spawn
// wiring is covered above with an injected spawnFn; the daemon runtime and its
// shutdown-cleanup invariant are covered in-process (fetch-driven fake page
// against an ephemeral listen(0) bridge) in tests/libs/sessionDaemon.test.ts.
