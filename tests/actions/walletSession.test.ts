import {describe, test, expect, beforeEach, afterEach, vi} from "vitest";
import {BaseAction} from "../../src/lib/actions/BaseAction";

/** Minimal concrete subclass exposing the protected resolution helpers. */
class TestAction extends BaseAction {
  publicResolveMode(flag?: string) {
    return (this as any).resolveWalletMode(flag);
  }
  publicIsBrowser(config: {wallet?: string}) {
    return (this as any).isBrowserWallet(config);
  }
}

describe("BaseAction wallet-mode resolution (config default)", () => {
  let action: TestAction;
  let configValue: any;
  let warnSpy: any;
  let sessionSpy: any;

  beforeEach(() => {
    action = new TestAction();
    configValue = null;
    vi.spyOn(action as any, "getConfigByKey").mockImplementation((...args: any[]) =>
      args[0] === "walletMode" ? configValue : null,
    );
    warnSpy = vi.spyOn(action as any, "logWarning").mockImplementation(() => {});
    // Default: no live session, so config tests stay hermetic (not swayed by a
    // descriptor on the machine running the suite). Session-rung tests flip it.
    sessionSpy = vi.spyOn(action as any, "hasLiveWalletSession").mockReturnValue(false);
  });
  afterEach(() => vi.restoreAllMocks());

  test("no flag + no config + no session → keystore", () => {
    expect(action.publicResolveMode(undefined)).toBe("keystore");
    expect(action.publicIsBrowser({})).toBe(false);
  });

  test("no flag + no config + live session → browser (connect-once)", () => {
    sessionSpy.mockReturnValue(true);
    expect(action.publicResolveMode(undefined)).toBe("browser");
    expect(action.publicIsBrowser({})).toBe(true);
  });

  test("explicit --wallet keystore overrides a live session", () => {
    sessionSpy.mockReturnValue(true);
    expect(action.publicResolveMode("keystore")).toBe("keystore");
  });

  test("walletMode=keystore config overrides a live session", () => {
    sessionSpy.mockReturnValue(true);
    configValue = "keystore";
    expect(action.publicResolveMode(undefined)).toBe("keystore");
  });

  test("live session is not consulted when config already decides (browser)", () => {
    configValue = "browser";
    expect(action.publicResolveMode(undefined)).toBe("browser");
    expect(sessionSpy).not.toHaveBeenCalled();
  });

  test("no flag + walletMode=browser config → browser", () => {
    configValue = "browser";
    expect(action.publicResolveMode(undefined)).toBe("browser");
    expect(action.publicIsBrowser({})).toBe(true);
  });

  test("explicit --wallet keystore overrides walletMode=browser config", () => {
    configValue = "browser";
    expect(action.publicResolveMode("keystore")).toBe("keystore");
    expect(action.publicIsBrowser({wallet: "keystore"})).toBe(false);
  });

  test("explicit --wallet browser works with no config", () => {
    expect(action.publicResolveMode("browser")).toBe("browser");
  });

  test("invalid config value warns and falls back to keystore", () => {
    configValue = "hardware";
    expect(action.publicResolveMode(undefined)).toBe("keystore");
    expect(warnSpy).toHaveBeenCalled();
  });

  test("invalid flag throws", () => {
    expect(() => action.publicResolveMode("ledger")).toThrow(/Invalid --wallet value 'ledger'/);
  });
});
