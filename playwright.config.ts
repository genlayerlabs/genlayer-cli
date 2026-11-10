import {defineConfig} from "@playwright/test";

/**
 * Tier-2 browser-wallet signing e2e (anvil lanes). Each spec boots an ephemeral
 * anvil + spawns the real CLI daemon + drives a headless chromium against the
 * real bridge page, so the runs must be serial: the session descriptor, the
 * detached daemon, and the loopback bridge port must never race between specs.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  retries: 0,
  reporter: [["list"]],
  // No webServer: the fixtures own chain + daemon lifecycle.
});
