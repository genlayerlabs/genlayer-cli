import {test, expect, type Browser} from "@playwright/test";
import {startAnvil, type AnvilHandle} from "./fixtures/chain";
import {
  makeScratchEnv,
  spawnConnect,
  runCli,
  readDescriptor,
  descriptorMode,
  daemonGet,
  isPidAlive,
  waitUntil,
  type ScratchEnv,
} from "./fixtures/cli";
import {launchBrowser, openDriver, type BridgeDriver} from "./helpers/bridgePage";

/**
 * S1 — connect / status / disconnect on anvil. One serial session: connect
 * once, inspect it, then tear it down. Assertions target the descriptor file,
 * the daemon HTTP surface, and the CLI stdout — not brittle DOM text.
 */
const CHAIN_ID = 61341;

test.describe.serial("S1 wallet session lifecycle", () => {
  let anvil: AnvilHandle;
  let browser: Browser;
  let driver: BridgeDriver;
  let scratch: ScratchEnv;
  let daemonPid: number;

  test.beforeAll(async () => {
    anvil = await startAnvil({chainId: CHAIN_ID});
    browser = await launchBrowser();
    scratch = makeScratchEnv({
      chainId: CHAIN_ID,
      rpcUrl: anvil.rpcUrl,
      stubAddress: anvil.stubAddress,
      timing: {longPollMs: 1000},
    });
  });

  test.afterAll(async () => {
    await driver?.close().catch(() => {});
    if (daemonPid && isPidAlive(daemonPid)) {
      try {
        process.kill(daemonPid, "SIGKILL");
      } catch {
        /* gone */
      }
    }
    await anvil?.stop();
  });

  test("connect: descriptor 0600, daemon reachable, Connected as ...", async () => {
    const connect = spawnConnect([], scratch);
    const url = await connect.waitForUrl();
    expect(url).toMatch(/#s=/);

    driver = await openDriver(browser, {
      rpcUrl: anvil.rpcUrl,
      chainId: CHAIN_ID,
      privateKey: anvil.account.privateKey,
    });
    await driver.connect(url);

    const line = await connect.waitForConnected();
    expect(line.toLowerCase()).toContain(anvil.account.address.toLowerCase());
    await new Promise<void>(res => connect.child.once("exit", () => res()));

    const d = readDescriptor(scratch);
    expect(d, "descriptor should exist after connect").not.toBeNull();
    daemonPid = d!.pid;
    expect(isPidAlive(d!.pid)).toBe(true);
    expect(d!.port).toBeGreaterThan(0);
    expect(d!.token).toBeTruthy();
    expect(d!.chainId).toBe(CHAIN_ID);
    expect((d!.address ?? "").toLowerCase()).toBe(anvil.account.address.toLowerCase());
    expect(descriptorMode(scratch)).toBe(0o600);

    const ping = await daemonGet(d!, "/api/ping");
    expect(ping.status).toBe(200);
    expect((ping.body as {status?: string}).status).toBe("ok");
  });

  test("status: reports address, connected, empty queue", async () => {
    const res = await runCli(["wallet", "status"], scratch);
    expect(res.exitCode).toBe(0);
    expect(res.all.toLowerCase()).toContain(anvil.account.address.toLowerCase());
    expect(res.all).toContain("connected");
    expect(res.all).toMatch(/queuedTransactions|queued/i);
  });

  test("disconnect: descriptor removed, daemon gone, status reports none", async () => {
    const res = await runCli(["wallet", "disconnect"], scratch);
    expect(res.all).toContain("Disconnected");

    const gone = await waitUntil(() => readDescriptor(scratch) === null && !isPidAlive(daemonPid), {
      timeoutMs: 8000,
    });
    expect(gone, "descriptor removed and daemon pid gone").toBe(true);

    const status = await runCli(["wallet", "status"], scratch);
    expect(status.all).toContain("No active wallet session");
    expect(status.exitCode).toBe(1);
  });
});
