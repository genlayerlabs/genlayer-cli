import {describe, expect, it} from "vitest";
import {
  assertNewer,
  compareVersions,
  devBranch,
  isPrerelease,
  parseVersion,
  run,
  runsVerdict,
  stableBranch,
  validateReleaseBranch,
} from "../scripts/release-policy.mjs";

describe("release branch policy", () => {
  it.each([
    ["0.40.1", "v0.40", "v0.40-dev"],
    ["v0.40.1-rc.1", "v0.40", "v0.40-dev"],
    ["0.41.0-rc.1", "v0.41", "v0.41-dev"],
    ["1.2.3", "v1", "v1-dev"],
  ])("maps %s to its stable and dev branch", (version, stable, dev) => {
    expect(stableBranch(version)).toBe(stable);
    expect(devBranch(version)).toBe(dev);
  });

  it("tells release candidates from finals", () => {
    expect(isPrerelease("0.40.1-rc.1")).toBe(true);
    expect(isPrerelease("0.40.1")).toBe(false);
    expect(parseVersion("v0.40.1-rc.1").normalized).toBe("0.40.1-rc.1");
  });

  it.each(["0.40", "0.40.1.0", "00.40.1", "latest", ""])("rejects malformed version '%s'", (version) => {
    expect(() => parseVersion(version)).toThrow("not a supported release version");
  });

  it.each(["0.40.1", "0.40.1-rc.1"])("accepts %s on the dev branch of its line", (version) => {
    expect(validateReleaseBranch("v0.40-dev", version)).toBe(version);
  });

  it.each([
    ["v0.40", "0.40.1"],
    ["v0.40", "0.40.1-rc.1"],
    ["v0.41-dev", "0.40.1"],
    ["main", "0.40.1"],
  ])("refuses a release commit on %s for %s", (branch, version) => {
    expect(() => validateReleaseBranch(branch, version)).toThrow("must be cut from v0.40-dev");
  });
});

describe("version ordering", () => {
  it.each([
    ["0.40.1", "0.40.0", 1],
    ["0.40.1-rc.1", "0.40.1", -1],
    ["0.40.1", "0.40.1-rc.9", 1],
    ["0.40.1-rc.2", "0.40.1-rc.10", -1],
    ["0.40.1-rc.1", "v0.40.1-rc.1", 0],
    ["0.40.1-rc.1", "0.40.1-rc", 1],
    ["0.40.1-1", "0.40.1-rc", -1],
    ["0.40.1-rc1", "0.40.1-rc.1", 1],
    ["0.41.0", "0.40.9", 1],
    ["1.0.0-rc.1", "0.99.9", 1],
  ])("compares %s with %s as %i", (a, b, expected) => {
    expect(compareVersions(a, b)).toBe(expected);
    expect(compareVersions(b, a)).toBe(0 - expected);
  });

  it("accepts a version newer than everything the line has", () => {
    expect(assertNewer("v0.40.1", ["0.40.0", "v0.40.0-rc.3", "v0.40.1-rc.2"])).toBe("0.40.1");
    expect(assertNewer("0.40.1-rc.1", [])).toBe("0.40.1-rc.1");
  });

  it.each([
    ["0.40.1-rc.1", ["0.40.1"]],
    ["0.40.0-rc.9", ["0.40.1"]],
    ["0.40.1", ["0.40.0", "v0.40.1"]],
    ["0.40.1", ["v0.40.2-rc.1"]],
  ])("refuses %s when the line already has %j", (version, existing) => {
    expect(() => assertNewer(version, existing)).toThrow("is not newer than");
  });

  it("ignores tags that are not release versions", () => {
    expect(assertNewer("0.40.1", ["v0.40", "latest", ""])).toBe("0.40.1");
  });
});

describe("workflow run verdict", () => {
  it.each([
    [[], "missing"],
    [["cancelled", "skipped"], "missing"],
    [["success"], "green"],
    [["success", "cancelled"], "green"],
    [["success", "failure"], "red"],
    [["timed_out"], "red"],
    [["success", "pending"], "pending"],
    [["failure", "pending"], "red"],
  ])("%j is %s", (conclusions, verdict) => {
    expect(runsVerdict(conclusions)).toBe(verdict);
  });
});

describe("release-policy command line", () => {
  it.each([
    [["dev-branch", "0.40.1"], "v0.40-dev"],
    [["stable-branch", "0.40.1"], "v0.40"],
    [["is-prerelease", "0.40.1-rc.1"], "true"],
    [["normalize", "v0.40.1"], "0.40.1"],
    [["validate", "v0.40-dev", "0.40.1"], "0.40.1"],
    [["assert-newer", "0.40.1", "0.40.0", "v0.40.1-rc.1"], "0.40.1"],
    [["runs-verdict"], "missing"],
    [["runs-verdict", "success", "success"], "green"],
  ])("%j prints %s", (args, expected) => {
    expect(run(args)).toBe(expected);
  });

  it("fails assert-newer on a version the line already passed", () => {
    expect(() => run(["assert-newer", "0.40.1-rc.1", "0.40.1"])).toThrow("is not newer than");
  });

  it("prints usage for an unknown command", () => {
    expect(() => run(["bump"])).toThrow("usage: release-policy.mjs");
  });
});
