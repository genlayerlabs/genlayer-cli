import {createRequire} from "node:module";
import type {SignerEth} from "@ledgerhq/device-signer-kit-ethereum";
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
  } catch {
    throw new Error(
      "Ledger USB support is unavailable. Reinstall genlayer with optional dependencies enabled and the native USB/HID prerequisites for your OS.",
    );
  }
  const [
    {DeviceManagementKitBuilder},
    {nodeHidTransportFactory},
    {SignerEthBuilder},
    {firstValueFrom, timeout},
  ] = modules;
  const dmk = new DeviceManagementKitBuilder().addTransport(nodeHidTransportFactory).build();
  let sessionId: string | undefined;
  try {
    console.error("Connect and unlock your Ledger. Follow the prompts on the device (Ethereum app).");
    const device = await firstValueFrom(dmk.startDiscovering({}).pipe(timeout(15_000)));
    await dmk.stopDiscovering();
    sessionId = await dmk.connect({device});
    return await operation(new SignerEthBuilder({dmk, sessionId}).build());
  } finally {
    try {
      if (sessionId) await dmk.disconnect({sessionId});
    } finally {
      dmk.close();
    }
  }
}
