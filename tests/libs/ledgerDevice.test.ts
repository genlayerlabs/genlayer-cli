// @vitest-environment node
import {beforeEach, afterEach, it, expect, vi} from "vitest";
import {NEVER, of, throwError} from "rxjs";
import {withLedger} from "../../src/lib/accounts/ledgerDevice";
const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  startDiscovering: vi.fn(),
  stopDiscovering: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  close: vi.fn(),
  signer: {},
}));
vi.mock("node:module", () => ({createRequire: () => mocks.load}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.startDiscovering.mockReturnValue(of({id: "usb"}));
  mocks.connect.mockResolvedValue("session");
  mocks.load.mockImplementation(name => {
    if (name === "@ledgerhq/device-management-kit")
      return {
        DeviceManagementKitBuilder: class {
          addTransport() {
            return this;
          }
          build() {
            return mocks;
          }
        },
      };
    if (name === "@ledgerhq/device-transport-kit-node-hid") return {nodeHidTransportFactory: vi.fn()};
    return {
      SignerEthBuilder: class {
        build() {
          return mocks.signer;
        }
      },
    };
  });
});
afterEach(() => vi.useRealTimers());
it("disconnects and closes after successful signing", async () => {
  expect(
    await withLedger(async signer => {
      expect(signer).toBe(mocks.signer);
      return "signed";
    }),
  ).toBe("signed");
  expect(mocks.stopDiscovering).toHaveBeenCalledOnce();
  expect(mocks.disconnect).toHaveBeenCalledWith({sessionId: "session"});
  expect(mocks.close).toHaveBeenCalledOnce();
});
it("releases USB after user rejection", async () => {
  await expect(
    withLedger(async () => {
      throw new Error("Rejected");
    }),
  ).rejects.toThrow("Rejected");
  expect(mocks.disconnect).toHaveBeenCalledOnce();
  expect(mocks.close).toHaveBeenCalledOnce();
});
it("closes discovery when no device can be accessed", async () => {
  mocks.startDiscovering.mockReturnValue(throwError(() => new Error("USB denied")));
  await expect(withLedger(async () => {})).rejects.toThrow("USB denied");
  expect(mocks.disconnect).not.toHaveBeenCalled();
  expect(mocks.close).toHaveBeenCalledOnce();
});
it("times out discovery and releases resources", async () => {
  vi.useFakeTimers();
  mocks.startDiscovering.mockReturnValue(NEVER);
  const result = expect(withLedger(async () => {})).rejects.toThrow();
  await vi.waitFor(() => expect(vi.getTimerCount()).toBeGreaterThan(0));
  await vi.advanceTimersByTimeAsync(15_001);
  await result;
  expect(mocks.close).toHaveBeenCalledOnce();
});
it("explains missing optional native dependencies", async () => {
  mocks.load.mockImplementation(() => {
    throw new Error("Module not found");
  });
  await expect(withLedger(async () => {})).rejects.toThrow("Ledger USB support is unavailable");
});
