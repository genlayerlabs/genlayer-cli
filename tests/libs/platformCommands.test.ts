import {describe, test, expect} from "vitest";
import {DEFAULT_RUN_SIMULATOR_COMMAND} from "../../src/lib/config/simulator";

describe("Platform-specific command generation", () => {
  describe("DEFAULT_RUN_SIMULATOR_COMMAND", () => {
    test("win32 command does not use start cmd.exe", () => {
      const cmds = DEFAULT_RUN_SIMULATOR_COMMAND("/some/path", "");
      expect(cmds.win32).not.toContain("start cmd.exe");
    });

    test("win32 command quotes the path", () => {
      const pathWithSpaces = "C:\\Program Files\\genlayer";
      const cmds = DEFAULT_RUN_SIMULATOR_COMMAND(pathWithSpaces, "");
      expect(cmds.win32).toContain(`"${pathWithSpaces}"`);
    });

    test("win32 command uses -d flag for detached mode", () => {
      const cmds = DEFAULT_RUN_SIMULATOR_COMMAND("/path", "");
      expect(cmds.win32).toContain("up -d");
    });

    test("win32 command uses cd /d for drive changes", () => {
      const cmds = DEFAULT_RUN_SIMULATOR_COMMAND("D:\\projects\\genlayer", "");
      expect(cmds.win32).toContain("cd /d");
    });

    test("linux command uses nohup with -d flag", () => {
      const cmds = DEFAULT_RUN_SIMULATOR_COMMAND("/path", "");
      expect(cmds.linux).toContain("nohup");
      expect(cmds.linux).toContain("up -d");
    });

    test("linux command quotes the path", () => {
      const cmds = DEFAULT_RUN_SIMULATOR_COMMAND("/path with spaces", "");
      expect(cmds.linux).toContain('"/path with spaces"');
    });

    test("darwin command uses osascript", () => {
      const cmds = DEFAULT_RUN_SIMULATOR_COMMAND("/path", "");
      expect(cmds.darwin).toContain("osascript");
    });

    test("darwin command quotes the path for spaces", () => {
      const cmds = DEFAULT_RUN_SIMULATOR_COMMAND("/path with spaces", "");
      expect(cmds.darwin).toContain("/path with spaces");
    });

    test("all platforms include profiles when provided", () => {
      const profiles = "--profile frontend --profile ollama";
      const cmds = DEFAULT_RUN_SIMULATOR_COMMAND("/path", profiles);
      expect(cmds.darwin).toContain(profiles);
      expect(cmds.win32).toContain(profiles);
      expect(cmds.linux).toContain(profiles);
    });

    test("all platforms include docker compose build and up", () => {
      const cmds = DEFAULT_RUN_SIMULATOR_COMMAND("/path", "");
      for (const platform of ["darwin", "win32", "linux"] as const) {
        expect(cmds[platform]).toContain("docker compose build");
        expect(cmds[platform]).toContain("docker compose -p genlayer");
      }
    });

    test("all platforms handle empty profiles", () => {
      const cmds = DEFAULT_RUN_SIMULATOR_COMMAND("/path", "");
      for (const platform of ["darwin", "win32", "linux"] as const) {
        expect(cmds[platform]).toContain("docker compose -p genlayer  up");
      }
    });

    test("paths with spaces are quoted on win32 and linux", () => {
      const spacePath = "/some path/with spaces";
      const cmds = DEFAULT_RUN_SIMULATOR_COMMAND(spacePath, "");
      expect(cmds.win32).toContain(`"${spacePath}"`);
      expect(cmds.linux).toContain(`"${spacePath}"`);
    });
  });
});
