import {describe, test, expect, beforeEach, afterEach, vi} from "vitest";

// Hermetic: no real daemon, tab, descriptor file, or spawn. Control the
// descriptor/pid primitives and the session client (mirrors walletConnect.test.ts).
vi.mock("../../src/lib/wallet/sessionDescriptor", () => ({
  descriptorPath: vi.fn(() => "/tmp/wallet-session.json"),
  readDescriptor: vi.fn(),
  removeDescriptor: vi.fn(),
  isPidAlive: vi.fn(),
}));
vi.mock("../../src/lib/wallet/sessionClient", () => ({
  WalletSessionClient: vi.fn(),
}));

import {WalletAction} from "../../src/commands/wallet/WalletAction";
import {readDescriptor, removeDescriptor, isPidAlive} from "../../src/lib/wallet/sessionDescriptor";
import {WalletSessionClient} from "../../src/lib/wallet/sessionClient";
import {HEARTBEAT_DEAD_MS} from "../../src/lib/wallet/sessionConstants";

const ADDRESS = "0xConnected0000000000000000000000000000001";

const DESCRIPTOR: any = {
  version: 1,
  pid: 4242,
  port: 7,
  token: "tok",
  address: ADDRESS,
  chainId: 4221,
  network: "testnet-bradbury",
  rpcUrl: "https://rpc.example",
  createdAt: Date.now() - 5 * 60_000,
  lastUsed: Date.now() - 2 * 60_000,
};

describe("WalletAction.status", () => {
  let action: WalletAction;
  let logInfo: any;
  let logWarning: any;
  let log: any;
  let savedExitCode: number | string | undefined;

  beforeEach(() => {
    vi.mocked(readDescriptor).mockReset();
    vi.mocked(removeDescriptor).mockReset();
    vi.mocked(isPidAlive).mockReset();
    vi.mocked(WalletSessionClient).mockReset();

    savedExitCode = process.exitCode;
    process.exitCode = 0;

    action = new WalletAction();
    log = vi.spyOn(action as any, "log").mockImplementation(() => {});
    logInfo = vi.spyOn(action as any, "logInfo").mockImplementation(() => {});
    logWarning = vi.spyOn(action as any, "logWarning").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = savedExitCode;
  });

  test("no descriptor → 'No active wallet session.' and exit code 1", async () => {
    vi.mocked(readDescriptor).mockReturnValue(null);

    await action.status();

    expect(logInfo).toHaveBeenCalledWith("No active wallet session.");
    expect(process.exitCode).toBe(1);
    expect(WalletSessionClient).not.toHaveBeenCalled();
  });

  test("live connected session → prints the status object, exit code 0", async () => {
    vi.mocked(readDescriptor).mockReturnValue(DESCRIPTOR);
    vi.mocked(isPidAlive).mockReturnValue(true);
    const client = {
      ping: vi.fn().mockResolvedValue(true),
      state: vi.fn().mockResolvedValue({
        connected: true,
        address: ADDRESS,
        chainId: 4221,
        url: "http://127.0.0.1:7/gl-wallet#s=tok",
        queuedCount: 0,
        createdAt: DESCRIPTOR.createdAt,
        lastPagePollAt: Date.now(),
      }),
    };
    vi.mocked(WalletSessionClient).mockReturnValue(client as any);

    await action.status();

    expect(log).toHaveBeenCalledWith(
      "Wallet session:",
      expect.objectContaining({
        status: "connected",
        address: ADDRESS,
        network: DESCRIPTOR.network,
        chainId: 4221,
        port: DESCRIPTOR.port,
        url: "http://127.0.0.1:7/gl-wallet#s=tok",
        tabHeartbeat: "fresh",
        queuedTransactions: 0,
      }),
    );
    expect(process.exitCode).toBe(0);
    expect(removeDescriptor).not.toHaveBeenCalled();
  });

  test("live-but-connecting session (not yet connected) → status 'connecting', exit code 1", async () => {
    vi.mocked(readDescriptor).mockReturnValue({...DESCRIPTOR, address: null});
    vi.mocked(isPidAlive).mockReturnValue(true);
    const client = {
      ping: vi.fn().mockResolvedValue(true),
      state: vi.fn().mockResolvedValue({
        connected: false,
        address: null,
        chainId: 4221,
        url: "http://127.0.0.1:7/gl-wallet#s=tok",
        queuedCount: 0,
        createdAt: DESCRIPTOR.createdAt,
        lastPagePollAt: Date.now(),
      }),
    };
    vi.mocked(WalletSessionClient).mockReturnValue(client as any);

    await action.status();

    expect(log).toHaveBeenCalledWith(
      "Wallet session:",
      expect.objectContaining({status: "connecting", address: "(not connected)"}),
    );
    expect(process.exitCode).toBe(1);
  });

  test("connected but stale tab heartbeat → reports heartbeat stale (still connected, exit 0)", async () => {
    vi.mocked(readDescriptor).mockReturnValue(DESCRIPTOR);
    vi.mocked(isPidAlive).mockReturnValue(true);
    const client = {
      ping: vi.fn().mockResolvedValue(true),
      state: vi.fn().mockResolvedValue({
        connected: true,
        address: ADDRESS,
        chainId: 4221,
        url: "http://127.0.0.1:7/gl-wallet#s=tok",
        queuedCount: 2,
        createdAt: DESCRIPTOR.createdAt,
        lastPagePollAt: Date.now() - (HEARTBEAT_DEAD_MS + 30_000),
      }),
    };
    vi.mocked(WalletSessionClient).mockReturnValue(client as any);

    await action.status();

    expect(log).toHaveBeenCalledWith(
      "Wallet session:",
      expect.objectContaining({
        tabHeartbeat: expect.stringMatching(/stale/),
        queuedTransactions: 2,
      }),
    );
    expect(process.exitCode).toBe(0);
  });

  test("stale descriptor (pid dead) → warns + cleans up, exit code 1, never reads state", async () => {
    vi.mocked(readDescriptor).mockReturnValue(DESCRIPTOR);
    vi.mocked(isPidAlive).mockReturnValue(false);
    const client = {
      ping: vi.fn().mockResolvedValue(true),
      state: vi.fn(),
    };
    vi.mocked(WalletSessionClient).mockReturnValue(client as any);

    await action.status();

    expect(logWarning).toHaveBeenCalledWith(expect.stringMatching(/stale/i));
    expect(removeDescriptor).toHaveBeenCalledWith("/tmp/wallet-session.json");
    expect(process.exitCode).toBe(1);
    expect(client.state).not.toHaveBeenCalled();
  });

  test("stale descriptor (pid alive but ping fails) → warns + cleans up, exit code 1", async () => {
    vi.mocked(readDescriptor).mockReturnValue(DESCRIPTOR);
    vi.mocked(isPidAlive).mockReturnValue(true);
    const client = {
      ping: vi.fn().mockResolvedValue(false),
      state: vi.fn(),
    };
    vi.mocked(WalletSessionClient).mockReturnValue(client as any);

    await action.status();

    expect(logWarning).toHaveBeenCalledWith(expect.stringMatching(/stale/i));
    expect(removeDescriptor).toHaveBeenCalledWith("/tmp/wallet-session.json");
    expect(process.exitCode).toBe(1);
    expect(client.state).not.toHaveBeenCalled();
  });
});

describe("WalletAction.disconnect", () => {
  let action: WalletAction;
  let logInfo: any;
  let logSuccess: any;
  let killSpy: any;

  beforeEach(() => {
    vi.mocked(readDescriptor).mockReset();
    vi.mocked(removeDescriptor).mockReset();
    vi.mocked(isPidAlive).mockReset();
    vi.mocked(WalletSessionClient).mockReset();

    action = new WalletAction();
    logInfo = vi.spyOn(action as any, "logInfo").mockImplementation(() => {});
    logSuccess = vi.spyOn(action as any, "logSuccess").mockImplementation(() => {});
    // Never send a real signal at a real pid.
    killSpy = vi.spyOn(process, "kill").mockImplementation(() => true as any);
  });
  afterEach(() => vi.restoreAllMocks());

  test("no descriptor → 'No active wallet session.', no throw, no client", async () => {
    vi.mocked(readDescriptor).mockReturnValue(null);

    await expect(action.disconnect()).resolves.toBeUndefined();

    expect(logInfo).toHaveBeenCalledWith("No active wallet session.");
    expect(WalletSessionClient).not.toHaveBeenCalled();
    expect(removeDescriptor).not.toHaveBeenCalled();
    expect(killSpy).not.toHaveBeenCalled();
  });

  test("live daemon, pid exits cleanly → shutdown + removeDescriptor, no SIGTERM", async () => {
    vi.mocked(readDescriptor).mockReturnValue(DESCRIPTOR);
    const client = {shutdown: vi.fn().mockResolvedValue(undefined)};
    vi.mocked(WalletSessionClient).mockReturnValue(client as any);
    // Daemon exits within the grace window.
    vi.spyOn(action as any, "waitForPidGone").mockResolvedValue(true);

    await action.disconnect();

    expect(client.shutdown).toHaveBeenCalledTimes(1);
    expect(removeDescriptor).toHaveBeenCalledWith("/tmp/wallet-session.json");
    expect(killSpy).not.toHaveBeenCalled();
    expect(logSuccess).toHaveBeenCalledWith("Disconnected.");
  });

  test("live daemon, pid lingers → SIGTERM fallback then removeDescriptor", async () => {
    vi.mocked(readDescriptor).mockReturnValue(DESCRIPTOR);
    const client = {shutdown: vi.fn().mockResolvedValue(undefined)};
    vi.mocked(WalletSessionClient).mockReturnValue(client as any);
    // Grace window elapses with the daemon still alive → SIGTERM path.
    vi.spyOn(action as any, "waitForPidGone").mockResolvedValue(false);
    vi.mocked(isPidAlive).mockReturnValue(true);

    await action.disconnect();

    expect(client.shutdown).toHaveBeenCalledTimes(1);
    expect(killSpy).toHaveBeenCalledWith(DESCRIPTOR.pid, "SIGTERM");
    expect(removeDescriptor).toHaveBeenCalledWith("/tmp/wallet-session.json");
    expect(logSuccess).toHaveBeenCalledWith("Disconnected.");
  });

  test("pid lingers but a racing exit makes isPidAlive false → no SIGTERM, still cleans up", async () => {
    vi.mocked(readDescriptor).mockReturnValue(DESCRIPTOR);
    const client = {shutdown: vi.fn().mockResolvedValue(undefined)};
    vi.mocked(WalletSessionClient).mockReturnValue(client as any);
    vi.spyOn(action as any, "waitForPidGone").mockResolvedValue(false);
    // waitForPidGone timed out, but the daemon has since exited.
    vi.mocked(isPidAlive).mockReturnValue(false);

    await action.disconnect();

    expect(killSpy).not.toHaveBeenCalled();
    expect(removeDescriptor).toHaveBeenCalledWith("/tmp/wallet-session.json");
    expect(logSuccess).toHaveBeenCalledWith("Disconnected.");
  });
});
