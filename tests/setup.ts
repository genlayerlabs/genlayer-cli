import {vi} from "vitest";

/**
 * Global test safety net: the `open` package launches a real browser. No
 * automated test may ever pop a browser tab (it would also orphan the tab when
 * the ephemeral bridge port dies). Every bridge/daemon test already injects a
 * mocked openUrl; this guarantees that even a test that forgets cannot reach
 * the real `open`. Files that specifically exercise openUrl (system.test.ts)
 * declare their own file-level vi.mock("open"), which takes precedence there.
 */
vi.mock("open", () => ({default: vi.fn(async () => ({}) as any)}));

/**
 * Hermetic config dir. ConfigFileManager resolves ~/.genlayer against
 * os.homedir(), and BaseAction.resolveWalletMode now reads the wallet-session
 * descriptor from that dir. The human running the suite may have a live wallet
 * session at their real ~/.genlayer/wallet-session.json — which would flip
 * bare commands into browser mode and break otherwise-hermetic tests.
 *
 * Redirect os.homedir() to a throwaway per-worker temp dir so hasLiveWalletSession
 * never sees a real descriptor unless a test opts in. Everything else on `os`
 * (tmpdir, platform, ...) is preserved. Files that mock os themselves (bare
 * vi.mock("os")) override this for their own scope; files that vi.spyOn(os,
 * "homedir") layer on top of it. We intentionally derive the path from
 * os.tmpdir() with plain string concat and let ConfigFileManager create the
 * dir, so this stays independent of any file that mocks "fs"/"path".
 */
vi.mock("os", async importActual => {
  const actual = await importActual<typeof import("os")>();
  const home = `${actual.tmpdir()}/genlayer-cli-test-home-${process.pid}`;
  const mocked = {...actual, homedir: () => home};
  return {...mocked, default: mocked};
});
