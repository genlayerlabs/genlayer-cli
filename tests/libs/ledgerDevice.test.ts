// @vitest-environment node
import {beforeEach, afterEach, it, expect, vi} from "vitest";
import {NEVER, of, throwError} from "rxjs";
import {offlineLedgerContext} from "../../src/lib/accounts/ledgerContext";
import {ledgerError} from "../../src/lib/accounts/ledgerErrors";
import {withLedger} from "../../src/lib/accounts/ledgerDevice";
const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  startDiscovering: vi.fn(),
  stopDiscovering: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  close: vi.fn(),
  destroy: vi.fn(),
  signer: {},
  withContextModule: vi.fn(),
}));
vi.mock("node:module", () => ({createRequire: () => mocks.load}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.startDiscovering.mockReturnValue(of({id: "usb"}));
  mocks.connect.mockResolvedValue("session");
  mocks.stopDiscovering.mockResolvedValue(undefined);
  mocks.load.mockImplementation(name => {
    if (name === "@ledgerhq/device-management-kit")
      return {
        DeviceManagementKitBuilder: class {
          addTransport(factory: (args: object) => unknown) {
            factory({});
            return this;
          }
          build() {
            return mocks;
          }
        },
      };
    if (name === "@ledgerhq/device-transport-kit-node-hid")
      return {
        NodeHidTransport: class {
          destroy = mocks.destroy;
        },
      };
    return {
      SignerEthBuilder: class {
        withContextModule(context: unknown) {
          mocks.withContextModule(context);
          return this;
        }
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
  expect(mocks.withContextModule).toHaveBeenCalledWith(offlineLedgerContext);
  expect(mocks.stopDiscovering).toHaveBeenCalledOnce();
  expect(mocks.disconnect).toHaveBeenCalledWith({sessionId: "session"});
  expect(mocks.close).toHaveBeenCalledOnce();
  expect(mocks.destroy).toHaveBeenCalledOnce();
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
it("polls the actual no-device error shape until a device appears", async () => {
  vi.useFakeTimers();
  mocks.startDiscovering
    .mockReturnValueOnce(throwError(() => ({_tag: "NoAccessibleDeviceError"})))
    .mockReturnValueOnce(throwError(() => ({_tag: "NoAccessibleDeviceError"})))
    .mockReturnValue(of({id: "usb"}));
  const result = withLedger(async () => "connected");
  await vi.waitFor(() => expect(mocks.startDiscovering).toHaveBeenCalledOnce());
  await vi.advanceTimersByTimeAsync(1001);
  expect(await result).toBe("connected");
  expect(mocks.startDiscovering).toHaveBeenCalledTimes(3);
  expect(vi.getTimerCount()).toBe(0);
});
it("waits 15 seconds on repeated no-device errors and stops polling", async () => {
  vi.useFakeTimers();
  mocks.startDiscovering.mockReturnValue(throwError(() => ({_tag: "NoAccessibleDeviceError"})));
  const result = expect(withLedger(async () => {})).rejects.toThrow(
    "No accessible Ledger found within 15 seconds",
  );
  await vi.waitFor(() => expect(mocks.startDiscovering).toHaveBeenCalledOnce());
  await vi.advanceTimersByTimeAsync(14_000);
  expect(mocks.close).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1001);
  await result;
  expect(mocks.close).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
it.each([
  [{_tag: "DeviceLockedError"}, "Unlock it with your PIN"],
  [{_tag: "GlobalCommandError", errorCode: "5515"}, "Unlock it with your PIN"],
  [{_tag: "UnsupportedApplicationDAError"}, "Ethereum app is not open"],
  [{_tag: "EthAppCommandError", errorCode: "6d00"}, "Ethereum app is not open"],
  [{_tag: "RefusedByUserDAError"}, "rejected on the device"],
  [{_tag: "EthAppCommandError", errorCode: "6982"}, "rejected on the device"],
  [{_tag: "EthAppCommandError", errorCode: "6985"}, "enable blind signing"],
  [{_tag: "EthAppCommandError", errorCode: "6a80"}, "blind signing is enabled"],
  [
    {_tag: "OpeningConnectionError", originalError: new Error("HID permission denied")},
    "HID permission denied",
  ],
  [{_tag: "DeviceDisconnectedWhileSendingError"}, "Ledger disconnected"],
])("maps SDK error %j to readable guidance", (error, expected) => {
  expect(ledgerError(error)).toBeInstanceOf(Error);
  expect(ledgerError(error).message).toContain(expected);
  expect(ledgerError(error).cause).toBe(error);
});
it("retains native dependency load diagnostics", async () => {
  const error = new Error("libudev.so.1: cannot open shared object file");
  mocks.load.mockImplementation(() => {
    throw error;
  });
  await expect(withLedger(async () => {})).rejects.toThrow("Cause: libudev.so.1");
});
it("explains both possible causes of status 6985", () => {
  const message = ledgerError({_tag: "EthAppCommandError", errorCode: "6985"}).message;
  expect(message).toContain("either the request was rejected on the device or blind signing is disabled");
});
