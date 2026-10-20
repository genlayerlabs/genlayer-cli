import {describe, test, vi, beforeEach, afterEach, expect} from "vitest";
import {BaseAction} from "../../src/lib/actions/BaseAction";

/**
 * Direct coverage of the shared connect-once identity resolver every read
 * command routes through. A tiny concrete subclass exposes the protected
 * seam; getSignerAddress / liveSessionAddress / resolveWalletMode are the three
 * collaborators, stubbed per case to exercise each precedence rung.
 */
class TestAction extends BaseAction {
  run(options: {account?: string}, explicit?: string) {
    return this.resolveActiveIdentity(options, explicit);
  }
}

describe("BaseAction.resolveActiveIdentity", () => {
  let action: TestAction;
  let signerSpy: any;
  let sessionSpy: any;
  let modeSpy: any;

  beforeEach(() => {
    action = new TestAction();
    signerSpy = vi.spyOn(action as any, "getSignerAddress");
    sessionSpy = vi.spyOn(action as any, "liveSessionAddress");
    modeSpy = vi.spyOn(action as any, "resolveWalletMode");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("1. explicit address wins over everything (no wallet consulted)", async () => {
    signerSpy.mockResolvedValue("0xKeystore");
    sessionSpy.mockResolvedValue("0xSession");
    modeSpy.mockReturnValue("browser");

    await expect(action.run({account: "acct"}, "0xExplicit")).resolves.toBe("0xExplicit");
    expect(signerSpy).not.toHaveBeenCalled();
    expect(sessionSpy).not.toHaveBeenCalled();
  });

  test("2. --account selects the keystore, short-circuiting a live session", async () => {
    signerSpy.mockResolvedValue("0xKeystore");
    sessionSpy.mockResolvedValue("0xSession");
    modeSpy.mockReturnValue("browser");

    await expect(action.run({account: "acct"})).resolves.toBe("0xKeystore");
    expect(sessionSpy).not.toHaveBeenCalled();
  });

  test("3. live browser session is the active identity over the keystore default", async () => {
    modeSpy.mockReturnValue("browser");
    sessionSpy.mockResolvedValue("0xSession");
    signerSpy.mockResolvedValue("0xKeystore");

    await expect(action.run({})).resolves.toBe("0xSession");
    expect(signerSpy).not.toHaveBeenCalled();
  });

  test("4. no session → falls back to the keystore address", async () => {
    modeSpy.mockReturnValue("keystore");
    sessionSpy.mockResolvedValue(null);
    signerSpy.mockResolvedValue("0xKeystore");

    await expect(action.run({})).resolves.toBe("0xKeystore");
  });

  test("4b. browser mode but no connected session → keystore fallback", async () => {
    modeSpy.mockReturnValue("browser");
    sessionSpy.mockResolvedValue(null);
    signerSpy.mockResolvedValue("0xKeystore");

    await expect(action.run({})).resolves.toBe("0xKeystore");
    expect(sessionSpy).toHaveBeenCalledTimes(1);
  });

  test("5. no keystore but a live session → last-resort session address", async () => {
    modeSpy.mockReturnValue("keystore");
    // First rung (browser) skipped; the keystore read throws; then the
    // last-resort session lookup succeeds.
    signerSpy.mockRejectedValue(new Error("Account 'default' not found."));
    sessionSpy.mockResolvedValue("0xSession");

    await expect(action.run({})).resolves.toBe("0xSession");
  });

  test("6. neither keystore nor session → throws a helpful error", async () => {
    modeSpy.mockReturnValue("keystore");
    signerSpy.mockRejectedValue(new Error("Account 'default' not found."));
    sessionSpy.mockResolvedValue(null);

    await expect(action.run({})).rejects.toThrow(/No address to inspect/);
  });
});
