// @vitest-environment node
import {createRequire} from "node:module";
import {afterEach, expect, it, vi} from "vitest";
import {offlineLedgerContext} from "../../src/lib/accounts/ledgerContext";

// Exercise the pinned SDK tasks, not mocks of the context module or device kit.
const require = createRequire(import.meta.url);
const {
  BuildBaseContexts,
} = require("@ledgerhq/device-signer-kit-ethereum/internal/app-binder/task/BuildBaseContexts.js");
const {
  BlindSigningDetectionTask,
} = require("@ledgerhq/device-signer-kit-ethereum/internal/app-binder/task/BlindSigningDetectionTask.js");
const {
  DeviceModelId,
  DeviceSessionStateType,
  DmkNetworkClient,
  noopLoggerFactory,
} = require("@ledgerhq/device-management-kit");
const {ClearSigningType} = require("@ledgerhq/device-signer-kit-ethereum/api/model/ClearSigningType.js");
const {ClearSignContextType} = require("@ledgerhq/context-module");
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([false, true])(
  "builds contexts and handles reporting without network even when device checks are enabled=%s",
  async web3ChecksEnabled => {
    const network = vi.fn(() => {
      throw new Error("Unexpected hosted service request");
    });
    vi.stubGlobal("fetch", network);
    const get = vi.spyOn(DmkNetworkClient.prototype, "get").mockImplementation(network);
    const post = vi.spyOn(DmkNetworkClient.prototype, "post").mockImplementation(network);
    const api = {
      getDeviceSessionState: () => ({
        deviceModelId: DeviceModelId.NANO_X,
        sessionStateType: DeviceSessionStateType.Ready,
        currentApp: {name: "Ethereum", version: "1.20.0"},
      }),
      sendCommand: async () => ({status: "SUCCESS", data: {challenge: "1234"}}),
    };
    const result = await new BuildBaseContexts(api, {
      contextModule: offlineLedgerContext,
      options: {},
      appConfig: {version: "1.20.0", web3ChecksEnabled},
      transaction: new Uint8Array([1, 2, 3]),
      subset: {chainId: 4221, to: `0x${"11".repeat(20)}`, data: "0x12345678"},
    }).run();
    expect(result.clearSignContexts).toEqual([]);
    expect(result.clearSigningType).toBe(ClearSigningType.BASIC);
    expect((await offlineLedgerContext.getFieldContext({}, ClearSignContextType.ETHEREUM_TOKEN)).type).toBe(
      "error",
    );
    const reporting = await new BlindSigningDetectionTask({
      contextModule: offlineLedgerContext,
      loggerFactory: noopLoggerFactory,
      input: {
        type: "transaction",
        hasContext: false,
        contextTypes: [],
        usedFallback: false,
        chainId: 4221,
        targetAddress: `0x${"11".repeat(20)}`,
        selectorId: "0x12345678",
        deviceModelId: DeviceModelId.NANO_X,
        signerAppVersion: "1.20.0",
        deviceVersion: "test",
        clearSigningType: ClearSigningType.BASIC,
        partialContextErrors: 0,
      },
    }).run();
    expect(reporting.isBlindSign).toBe(true);
    expect(get).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  },
);
