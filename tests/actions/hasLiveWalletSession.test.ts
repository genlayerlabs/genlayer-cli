import {describe, test, expect, beforeEach, afterEach, vi} from "vitest";

// Control the descriptor/pid primitives the helper delegates to.
vi.mock("../../src/lib/wallet/sessionDescriptor", () => ({
  descriptorPath: vi.fn(() => "/tmp/wallet-session.json"),
  readDescriptor: vi.fn(),
  isPidAlive: vi.fn(),
}));

import {BaseAction} from "../../src/lib/actions/BaseAction";
import {readDescriptor, isPidAlive} from "../../src/lib/wallet/sessionDescriptor";

class TestAction extends BaseAction {
  publicHasLiveSession() {
    return (this as any).hasLiveWalletSession();
  }
}

describe("BaseAction.hasLiveWalletSession", () => {
  let action: TestAction;

  beforeEach(() => {
    action = new TestAction();
    vi.mocked(readDescriptor).mockReset();
    vi.mocked(isPidAlive).mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  test("no descriptor → false (pid never checked)", () => {
    vi.mocked(readDescriptor).mockReturnValue(null);
    expect(action.publicHasLiveSession()).toBe(false);
    expect(isPidAlive).not.toHaveBeenCalled();
  });

  test("descriptor present + pid alive → true", () => {
    vi.mocked(readDescriptor).mockReturnValue({pid: 4242} as any);
    vi.mocked(isPidAlive).mockReturnValue(true);
    expect(action.publicHasLiveSession()).toBe(true);
    expect(isPidAlive).toHaveBeenCalledWith(4242);
  });

  test("descriptor present but pid dead → false", () => {
    vi.mocked(readDescriptor).mockReturnValue({pid: 4242} as any);
    vi.mocked(isPidAlive).mockReturnValue(false);
    expect(action.publicHasLiveSession()).toBe(false);
  });

  test("a throwing descriptor read reads as no session (never throws)", () => {
    vi.mocked(readDescriptor).mockImplementation(() => {
      throw new Error("locked file");
    });
    expect(() => action.publicHasLiveSession()).not.toThrow();
    expect(action.publicHasLiveSession()).toBe(false);
  });
});
