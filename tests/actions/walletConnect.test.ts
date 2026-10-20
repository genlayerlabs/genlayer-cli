import {describe, test, expect, beforeEach, afterEach, vi} from "vitest";

// Hermetic: no real daemon, tab, descriptor file, or spawn. Control the
// descriptor/pid primitives, the daemon spawn, and the session client.
vi.mock("../../src/lib/wallet/sessionDescriptor", () => ({
  descriptorPath: vi.fn(() => "/tmp/wallet-session.json"),
  readDescriptor: vi.fn(),
  removeDescriptor: vi.fn(),
  isPidAlive: vi.fn(),
}));
vi.mock("../../src/lib/wallet/spawnDaemon", () => ({
  spawnWalletDaemon: vi.fn(),
  waitForDaemonReady: vi.fn(),
}));
vi.mock("../../src/lib/wallet/sessionClient", () => ({
  WalletSessionClient: vi.fn(),
}));

import {WalletAction} from "../../src/commands/wallet/WalletAction";
import {readDescriptor, isPidAlive} from "../../src/lib/wallet/sessionDescriptor";
import {spawnWalletDaemon, waitForDaemonReady} from "../../src/lib/wallet/spawnDaemon";
import {WalletSessionClient} from "../../src/lib/wallet/sessionClient";
import {HEARTBEAT_DEAD_MS} from "../../src/lib/wallet/sessionConstants";

const ADDRESS = "0xConnected0000000000000000000000000000001";
const CHAIN: any = {id: 4221, name: "Genlayer Bradbury Testnet"};

const DESCRIPTOR: any = {
  version: 1,
  pid: 4242,
  port: 7,
  token: "tok",
  address: ADDRESS,
  chainId: 4221,
  network: "testnet-bradbury",
  rpcUrl: "https://rpc.example",
  createdAt: Date.now(),
  lastUsed: Date.now(),
};

describe("WalletAction.connect — tab-dead recovery", () => {
  let action: WalletAction;
  let logInfo: any;
  let logSuccess: any;
  let succeedSpinner: any;

  beforeEach(() => {
    vi.mocked(readDescriptor).mockReset();
    vi.mocked(isPidAlive).mockReset();
    vi.mocked(spawnWalletDaemon).mockReset();
    vi.mocked(waitForDaemonReady).mockReset();
    vi.mocked(WalletSessionClient).mockReset();

    action = new WalletAction();
    // Avoid config/network + FS + spinner side effects.
    vi.spyOn(action as any, "resolveChain").mockReturnValue(CHAIN);
    vi.spyOn(action as any, "networkAlias").mockReturnValue("testnet-bradbury");
    vi.spyOn(action as any, "getFilePath").mockReturnValue("/tmp/wallet-daemon.log");
    logInfo = vi.spyOn(action as any, "logInfo").mockImplementation(() => {});
    logSuccess = vi.spyOn(action as any, "logSuccess").mockImplementation(() => {});
    vi.spyOn(action as any, "logWarning").mockImplementation(() => {});
    vi.spyOn(action as any, "startSpinner").mockImplementation(() => {});
    vi.spyOn(action as any, "stopSpinner").mockImplementation(() => {});
    succeedSpinner = vi.spyOn(action as any, "succeedSpinner").mockImplementation(() => {});
    vi.spyOn(action as any, "failSpinner").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  test("healthy session (fresh heartbeat, connected) → 'Already connected', no respawn", async () => {
    vi.mocked(readDescriptor).mockReturnValue(DESCRIPTOR);
    vi.mocked(isPidAlive).mockReturnValue(true);
    const client = {
      ping: vi.fn().mockResolvedValue(true),
      state: vi.fn().mockResolvedValue({
        connected: true,
        address: ADDRESS,
        chainId: 4221,
        lastPagePollAt: Date.now(),
      }),
      shutdown: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(WalletSessionClient).mockReturnValue(client as any);

    await action.connect({});

    expect(logSuccess).toHaveBeenCalledWith(expect.stringMatching(/Already connected/));
    expect(client.shutdown).not.toHaveBeenCalled();
    expect(spawnWalletDaemon).not.toHaveBeenCalled();
  });

  test("tab-dead session (alive + pinging + connected but STALE heartbeat) → tears down and respawns", async () => {
    const stale = Date.now() - (HEARTBEAT_DEAD_MS + 30_000);
    // First read discovers the stale daemon; waitForDescriptorGone then sees it gone.
    vi.mocked(readDescriptor).mockReturnValueOnce(DESCRIPTOR).mockReturnValue(null);
    vi.mocked(isPidAlive).mockReturnValue(true);

    const staleClient = {
      ping: vi.fn().mockResolvedValue(true),
      state: vi.fn().mockResolvedValue({
        connected: true,
        address: ADDRESS,
        chainId: 4221,
        lastPagePollAt: stale,
      }),
      shutdown: vi.fn().mockResolvedValue(undefined),
    };
    const freshClient = {
      state: vi.fn().mockResolvedValue({url: "http://127.0.0.1:7/gl-wallet#s=tok"}),
      waitForConnection: vi.fn().mockResolvedValue(ADDRESS),
    };
    vi.mocked(WalletSessionClient)
      .mockImplementationOnce(() => staleClient as any)
      .mockImplementationOnce(() => freshClient as any);
    vi.mocked(waitForDaemonReady).mockResolvedValue({...DESCRIPTOR} as any);

    await action.connect({});

    // The stale daemon was torn down and a brand-new one spawned.
    expect(staleClient.shutdown).toHaveBeenCalledTimes(1);
    expect(spawnWalletDaemon).toHaveBeenCalledTimes(1);
    expect(freshClient.waitForConnection).toHaveBeenCalled();
    expect(succeedSpinner).toHaveBeenCalledWith(expect.stringMatching(/Connected as/));
    // Must NOT short-circuit with "Already connected" on the dead tab.
    expect(logSuccess).not.toHaveBeenCalledWith(expect.stringMatching(/Already connected/));
    // The recovery is announced.
    expect(logInfo).toHaveBeenCalledWith(expect.stringMatching(/tab was closed/i));
  });

  test("different chain still switches (shutdown + respawn), unaffected by the heartbeat check", async () => {
    vi.mocked(readDescriptor)
      .mockReturnValueOnce({...DESCRIPTOR, chainId: 9999})
      .mockReturnValue(null);
    vi.mocked(isPidAlive).mockReturnValue(true);

    const oldClient = {
      ping: vi.fn().mockResolvedValue(true),
      state: vi.fn().mockResolvedValue({
        connected: true,
        address: ADDRESS,
        chainId: 9999,
        lastPagePollAt: Date.now(),
      }),
      shutdown: vi.fn().mockResolvedValue(undefined),
    };
    const freshClient = {
      state: vi.fn().mockResolvedValue({url: "http://127.0.0.1:7/gl-wallet#s=tok"}),
      waitForConnection: vi.fn().mockResolvedValue(ADDRESS),
    };
    vi.mocked(WalletSessionClient)
      .mockImplementationOnce(() => oldClient as any)
      .mockImplementationOnce(() => freshClient as any);
    vi.mocked(waitForDaemonReady).mockResolvedValue({...DESCRIPTOR} as any);

    await action.connect({network: "localnet"});

    expect(logInfo).toHaveBeenCalledWith(expect.stringMatching(/Switching wallet session/));
    expect(oldClient.shutdown).toHaveBeenCalledTimes(1);
    expect(spawnWalletDaemon).toHaveBeenCalledTimes(1);
    expect(logSuccess).not.toHaveBeenCalledWith(expect.stringMatching(/Already connected/));
  });
});
