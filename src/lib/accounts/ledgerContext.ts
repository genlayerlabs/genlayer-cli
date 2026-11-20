import type {ContextModule, ClearSignContextType} from "@ledgerhq/context-module";

/**
 * No remote loaders or reporting. Removing only the SDK's default loaders leaves
 * field loaders and telemetry enabled in context-module 2.9.0; replace the whole
 * interface instead. Contract calldata therefore requires on-device blind signing.
 */
export const offlineLedgerContext: ContextModule = {
  async getContexts() {
    return [];
  },
  async getFieldContext() {
    return {
      type: "error" as ClearSignContextType.ERROR,
      error: new Error("Remote Ledger field metadata is disabled"),
    };
  },
  async getTypedDataFilters() {
    return {type: "error", error: new Error("Ledger typed-data signing is not supported by the CLI")};
  },
  async report() {},
  async signReport() {},
};
