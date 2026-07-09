import {test, expect, type Browser} from "@playwright/test";
import {startAnvil, type AnvilHandle} from "./fixtures/chain";
import {
  makeScratchEnv,
  runCli,
  readDescriptor,
  daemonGet,
  isPidAlive,
  waitUntil,
  type ScratchEnv,
} from "./fixtures/cli";
import {launchBrowser, establishSession, type BridgeDriver} from "./helpers/bridgePage";

/**
 * S6 (subset) — deterministic error lanes with short timing overrides so they
 * resolve in seconds:
 *   - user reject (4001): CLI surfaces "Transaction rejected in wallet", exits
 *     non-zero, and the session stays usable (daemon still pinging).
 *   - tab closed: page.close() → heartbeat goes stale → the next command fails
 *     fast with "tab appears to be closed", never hanging on a dead tab.
 */

test.describe.serial("S6a user reject (4001)", () => {
  const CHAIN_ID = 61344;
  let anvil: AnvilHandle;
  let browser: Browser;
  let driver: BridgeDriver;
  let scratch: ScratchEnv;

  test.beforeAll(async () => {
    anvil = await startAnvil({chainId: CHAIN_ID});
    browser = await launchBrowser();
    scratch = makeScratchEnv({
      chainId: CHAIN_ID,
      rpcUrl: anvil.rpcUrl,
      stubAddress: anvil.stubAddress,
      timing: {longPollMs: 1000},
    });
    ({driver} = await establishSession(browser, anvil, scratch, {behavior: "reject"}));
  });

  test.afterAll(async () => {
    await driver?.close().catch(() => {});
    const d = readDescriptor(scratch);
    if (d && isPidAlive(d.pid)) {
      try {
        process.kill(d.pid, "SIGKILL");
      } catch {
        /* gone */
      }
    }
    await anvil?.stop();
  });

  test("reject surfaces the message, exits non-zero, session survives", async () => {
    const res = await runCli(
      ["staking", "validator-join", "--amount", "1", "--wallet", "browser"],
      scratch,
    );
    expect(res.all).toContain("Transaction rejected in wallet");
    expect(res.exitCode).not.toBe(0);

    // Session stays usable: descriptor present, daemon still answers /api/ping.
    const d = readDescriptor(scratch);
    expect(d).not.toBeNull();
    expect(isPidAlive(d!.pid)).toBe(true);
    const ping = await daemonGet(d!, "/api/ping");
    expect(ping.status).toBe(200);
  });
});

test.describe.serial("S6b tab closed", () => {
  const CHAIN_ID = 61345;
  const HEARTBEAT_DEAD_MS = 2000;
  let anvil: AnvilHandle;
  let browser: Browser;
  let driver: BridgeDriver;
  let scratch: ScratchEnv;

  test.beforeAll(async () => {
    anvil = await startAnvil({chainId: CHAIN_ID});
    browser = await launchBrowser();
    scratch = makeScratchEnv({
      chainId: CHAIN_ID,
      rpcUrl: anvil.rpcUrl,
      stubAddress: anvil.stubAddress,
      timing: {longPollMs: 500, heartbeatDeadMs: HEARTBEAT_DEAD_MS},
    });
    ({driver} = await establishSession(browser, anvil, scratch));
  });

  test.afterAll(async () => {
    await driver?.close().catch(() => {});
    const d = readDescriptor(scratch);
    if (d && isPidAlive(d.pid)) {
      try {
        process.kill(d.pid, "SIGKILL");
      } catch {
        /* gone */
      }
    }
    await anvil?.stop();
  });

  test("closed tab → fail-fast 'tab appears to be closed'", async () => {
    const d = readDescriptor(scratch)!;
    await driver.closePage();

    // Wait for the page heartbeat to go stale (no more polls after close).
    const stale = await waitUntil(
      async () => {
        const {body} = await daemonGet(d, "/api/state");
        const last = (body as {lastPagePollAt?: number}).lastPagePollAt ?? 0;
        return last > 0 && Date.now() - last > HEARTBEAT_DEAD_MS;
      },
      {timeoutMs: 10_000, intervalMs: 200},
    );
    expect(stale, "heartbeat should go stale after tab close").toBe(true);

    const res = await runCli(
      ["staking", "validator-join", "--amount", "1", "--wallet", "browser"],
      scratch,
      {timeoutMs: 20_000},
    );
    expect(res.all.toLowerCase()).toContain("tab appears to be closed");
    expect(res.exitCode).not.toBe(0);
  });
});
