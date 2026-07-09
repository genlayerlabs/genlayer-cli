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

  beforeEach(() => {
    action = new TestAction();
    configValue = null;
    vi.spyOn(action as any, "getConfigByKey").mockImplementation((...args: any[]) =>
      args[0] === "walletMode" ? configValue : null,
    );
    warnSpy = vi.spyOn(action as any, "logWarning").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  test("no flag + no config → keystore", () => {
    expect(action.publicResolveMode(undefined)).toBe("keystore");
    expect(action.publicIsBrowser({})).toBe(false);
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
