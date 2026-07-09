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
