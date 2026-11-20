import {createRequire} from "node:module";
import type {SignerEth} from "@ledgerhq/device-signer-kit-ethereum";
import {offlineLedgerContext} from "./ledgerContext";
import {isNoLedgerDevice, ledgerError} from "./ledgerErrors";
import type {Observable} from "rxjs";

/** Wait for a terminal device state, releasing subscriptions on every outcome. */
export async function deviceResult<T>(action: {
  observable: Observable<{status: string; output?: T; error?: unknown}>;
  cancel: () => void;
}): Promise<T> {
  const {firstValueFrom, filter, timeout} = await import("rxjs");
  try {
    const state = await firstValueFrom(
      action.observable.pipe(
        filter(state => ["completed", "error", "stopped"].includes(state.status)),
        timeout(120_000),
      ),
    );
    if (state.status === "completed") return state.output as T;
    throw state.error || new Error("Ledger operation cancelled");
  } catch (error) {
    throw ledgerError(error);
  } finally {
    action.cancel();
  }
}

export async function withLedger<T>(operation: (signer: SignerEth) => Promise<T>): Promise<T> {
  let modules;
  try {
    // Ledger's ESM distribution uses extensionless imports; use its Node CJS exports.
    const require = createRequire(import.meta.url);
    modules = [
      require("@ledgerhq/device-management-kit") as typeof import("@ledgerhq/device-management-kit"),
      require("@ledgerhq/device-transport-kit-node-hid") as typeof import("@ledgerhq/device-transport-kit-node-hid"),
      require("@ledgerhq/device-signer-kit-ethereum") as typeof import("@ledgerhq/device-signer-kit-ethereum"),
      await import("rxjs"),
    ] as const;
  } catch (error) {
    const cause = ledgerError(error);
    throw Object.assign(
      new Error(
        `Ledger USB support is unavailable. Reinstall genlayer with optional dependencies enabled and the native USB/HID prerequisites for your OS. Cause: ${cause.message}`,
      ),
      {cause: error},
    );
  }
  const [
    {DeviceManagementKitBuilder},
    {NodeHidTransport},
    {SignerEthBuilder},
    {firstValueFrom, timeout, defer, retry, timer, concatMap},
  ] = modules;
  let transport: InstanceType<typeof NodeHidTransport> | undefined;
  const dmk = new DeviceManagementKitBuilder()
    .addTransport(args => {
      transport = new NodeHidTransport(
        args.deviceModelDataSource,
        args.loggerServiceFactory,
        args.apduSenderServiceFactory,
        args.apduReceiverServiceFactory,
      );
      return transport;
    })
    .build();
  let sessionId: string | undefined;
  try {
    console.error("Connect and unlock your Ledger. Follow the prompts on the device (Ethereum app).");
    let lastDiscoveryError: unknown;
    const device = await firstValueFrom(
      defer(() => dmk.startDiscovering({})).pipe(
        retry({
          delay: error => {
            if (!isNoLedgerDevice(error)) throw error;
            lastDiscoveryError = error;
            return defer(() => dmk.stopDiscovering()).pipe(concatMap(() => timer(500)));
          },
        }),
        timeout(15_000),
      ),
    ).catch(error => {
      if (error?.name === "TimeoutError") {
        throw ledgerError(lastDiscoveryError ?? {_tag: "NoAccessibleDeviceError"});
      }
      throw error;
    });
    await dmk.stopDiscovering();
    sessionId = await dmk.connect({device});
    return await operation(
      new SignerEthBuilder({dmk, sessionId}).withContextModule(offlineLedgerContext).build(),
    );
  } catch (error) {
    throw ledgerError(error);
  } finally {
    try {
      if (sessionId) await dmk.disconnect({sessionId});
    } finally {
      try {
        dmk.close();
      } finally {
        // DMK 1.12.0 close() closes sessions, not the transport hotplug listeners.
        transport?.destroy();
      }
    }
  }
}
