import {createRequire} from "node:module";
import {describe, expect, it} from "vitest";
import {resolveReleaseChannel} from "../scripts/resolve-release-channel.mjs";

const require = createRequire(import.meta.url);
const releaseConfig = require("../.release-it.cjs");

describe("release channel policy", () => {
  it("publishes stable releases to latest", () => {
    expect(resolveReleaseChannel("0.40.0", "0.40.0")).toEqual({
      isPrerelease: false,
      npmDistTag: "latest",
    });
  });

  it("publishes v0.40.0-rc.3 to rc without moving latest", () => {
    expect(resolveReleaseChannel("0.40.0-rc.3", "0.40.0-rc.3")).toEqual({
      isPrerelease: true,
      npmDistTag: "rc",
    });
  });

  it("rejects mismatched tags", () => {
    expect(() => resolveReleaseChannel("0.40.0-rc.3", "0.40.0-clarke.4")).toThrow(
      "disagree",
    );
  });

  it("rejects prereleases that could target latest", () => {
    expect(() => resolveReleaseChannel("0.40.0-latest.1", "0.40.0-latest.1")).toThrow(
      "Invalid prerelease npm dist-tag",
    );
  });

  it("rejects version-like prerelease channels", () => {
    expect(() => resolveReleaseChannel("0.40.0-2.1", "0.40.0-2.1")).toThrow(
      "Invalid prerelease npm dist-tag",
    );
  });

  it("keeps release commits eligible for tag-triggered publishing", () => {
    expect(releaseConfig.git.commitMessage).toBe("Release v${version}");
    expect(releaseConfig.git.commitMessage).not.toMatch(
      /\[(?:skip ci|ci skip|no ci|skip actions|actions skip)\]/i,
    );
    expect(releaseConfig.git.commitMessage).not.toMatch(/skip-checks:\s*true/i);
  });
});
