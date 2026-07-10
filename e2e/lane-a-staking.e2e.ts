import {test, expect, type Browser} from "@playwright/test";
import {startAnvil, readStubCallCount, receiptSucceeded, type AnvilHandle} from "./fixtures/chain";
import {makeScratchEnv, runCli, readDescriptor, isPidAlive, type ScratchEnv} from "./fixtures/cli";
import {launchBrowser, establishSession, type BridgeDriver} from "./helpers/bridgePage";

/**
 * Lane A — real sign -> broadcast -> receipt loop against a recording
 * StakingStub on anvil. Proves the browser wallet actually signs and the CLI
 * observes a real receipt; it does NOT stand up consensus.
 *
 * S2: one `validator-join --wallet browser` signs and succeeds.
 * S4: session reuse — two more sequential joins over the same daemon/tab.
 */
const CHAIN_ID = 61342;
const HASH_RE = /0x[0-9a-fA-F]{64}/;

test.describe.serial("Lane A staking (validator-join)", () => {
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

  test("S2: validator-join --wallet browser signs and mines", async () => {
    const before = await readStubCallCount(anvil);
    const res = await runCli(
      ["staking", "validator-join", "--force", "--amount", "1", "--wallet", "browser"],
      scratch,
    );

    expect(res.all).toContain("Validator created successfully!");
    const hash = res.all.match(HASH_RE)?.[0] as `0x${string}` | undefined;
    expect(hash, "a tx hash should be printed").toBeTruthy();
    expect(await receiptSucceeded(anvil, hash!)).toBe(true);
    expect(await readStubCallCount(anvil)).toBe(before + 1);
  });

  test("S4: session reuse — two sequential joins, one tab, distinct hashes", async () => {
    const d0 = readDescriptor(scratch);
    expect(d0).not.toBeNull();
    const before = await readStubCallCount(anvil);

    const first = await runCli(
      ["staking", "validator-join", "--force", "--amount", "1", "--wallet", "browser"],
      scratch,
    );
    const second = await runCli(
      ["staking", "validator-join", "--force", "--amount", "2", "--wallet", "browser"],
      scratch,
    );

    const h1 = first.all.match(HASH_RE)?.[0] as `0x${string}` | undefined;
    const h2 = second.all.match(HASH_RE)?.[0] as `0x${string}` | undefined;
    expect(h1).toBeTruthy();
    expect(h2).toBeTruthy();
    expect(h1).not.toBe(h2);
    expect(await receiptSucceeded(anvil, h1!)).toBe(true);
    expect(await receiptSucceeded(anvil, h2!)).toBe(true);

    // Same daemon reused: pid unchanged, single descriptor, both calls recorded.
    const d1 = readDescriptor(scratch);
    expect(d1!.pid).toBe(d0!.pid);
    expect(await readStubCallCount(anvil)).toBe(before + 2);
  });
});
