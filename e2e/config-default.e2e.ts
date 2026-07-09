import {test, expect, type Browser} from "@playwright/test";
import {startAnvil, readStubCallCount, type AnvilHandle} from "./fixtures/chain";
import {makeScratchEnv, runCli, readDescriptor, isPidAlive, type ScratchEnv} from "./fixtures/cli";
import {launchBrowser, establishSession, type BridgeDriver} from "./helpers/bridgePage";

/**
 * S5 — config default `walletMode=browser`. With the config set and a live
 * session, a bare `validator-join` (no --wallet) signs via the browser session;
 * an explicit `--wallet keystore` overrides it and takes the keystore path
 * (which errors here because no keystore exists — proving it did NOT enqueue).
 */
const CHAIN_ID = 61343;
const HASH_RE = /0x[0-9a-fA-F]{64}/;

test.describe.serial("S5 config default walletMode=browser", () => {
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
      walletMode: "browser",
      timing: {longPollMs: 1000},
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

  test("bare validator-join signs via session (no --wallet flag)", async () => {
    const before = await readStubCallCount(anvil);
    const res = await runCli(["staking", "validator-join", "--amount", "1"], scratch);
    expect(res.all).toContain("Validator created successfully!");
    expect(res.all.match(HASH_RE)?.[0]).toBeTruthy();
    expect(await readStubCallCount(anvil)).toBe(before + 1);
  });

  test("--wallet keystore overrides config, takes keystore path (no enqueue)", async () => {
    const before = await readStubCallCount(anvil);
    const res = await runCli(
      ["staking", "validator-join", "--amount", "1", "--wallet", "keystore"],
      scratch,
    );
    // Keystore path selected: it fails on the missing account rather than
    // signing via the browser session.
    expect(res.all).not.toContain("Validator created successfully!");
    expect(res.all.toLowerCase()).toContain("not found");
    expect(res.exitCode).not.toBe(0);
    // The browser session was never used → no new recorded call on the stub.
    expect(await readStubCallCount(anvil)).toBe(before);
  });
});
