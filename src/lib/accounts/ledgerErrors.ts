/** Ledger's errors are often tagged objects, not Error instances. */
function errorDetails(error: unknown, depth = 0): {tag: string; code: string; message: string} {
  if (depth > 5 || !error || typeof error !== "object") {
    return {tag: "", code: "", message: typeof error === "string" ? error : ""};
  }
  const value = error as Record<string, unknown>;
  const nested = errorDetails(value.originalError ?? value.cause ?? value.err, depth + 1);
  return {
    tag: [value._tag, value.name, nested.tag].filter(v => typeof v === "string").join(" "),
    code: typeof value.errorCode === "string" ? value.errorCode.toLowerCase() : nested.code,
    message: typeof value.message === "string" ? value.message : nested.message,
  };
}

export function isNoLedgerDevice(error: unknown): boolean {
  return errorDetails(error).tag.includes("NoAccessibleDeviceError");
}

export function ledgerError(error: unknown): Error {
  if (error instanceof Error && error.name === "LedgerError") return error;
  const {tag, code, message} = errorDetails(error);
  let explanation: string;
  if (tag.includes("DeviceLockedError") || code === "5515") {
    explanation = "Ledger is locked. Unlock it with your PIN and retry.";
  } else if (tag.includes("RefusedByUserDAError") || code === "6982") {
    explanation = "Ledger request rejected on the device. Nothing was signed; retry when ready.";
  } else if (code === "6985") {
    // The Ethereum app uses this status for both refusal and unmet signing conditions.
    explanation =
      "Ledger refused the request or its signing conditions were not met. For contract calls, enable blind signing in the Ethereum app, then review and approve on the device.";
  } else if (code === "6a80") {
    explanation =
      "Ledger rejected the transaction data. For contract calls, check that blind signing is enabled in the Ethereum app; otherwise verify that the transaction is supported.";
  } else if (tag.includes("UnsupportedApplicationDAError") || code === "6d00" || code === "6e00") {
    explanation =
      "Ledger Ethereum app is not open or is unsupported. Install/update and open the Ethereum app, then retry.";
  } else if (tag.includes("NoAccessibleDeviceError")) {
    explanation =
      "No accessible Ledger found within 15 seconds. Connect and unlock one device; check USB/HID permissions and close Ledger Live.";
  } else if (/DeviceDisconnected|ReconnectionFailed/.test(tag)) {
    explanation = "Ledger disconnected. Reconnect and unlock it, then retry.";
  } else if (/OpeningConnection|DeviceBusy/.test(tag)) {
    explanation =
      "Cannot open Ledger USB connection. Check USB/HID permissions and close other applications using the device.";
  } else if (/Timeout/.test(tag)) {
    explanation = "Ledger operation timed out. Unlock the device and follow its prompts, then retry.";
  } else {
    explanation =
      message ||
      `Ledger operation failed (${tag.trim() || "unknown device error"}). Reconnect the device and retry.`;
  }
  const detail = message && explanation !== message ? ` Cause: ${message}` : "";
  return Object.assign(new Error(explanation + detail), {name: "LedgerError", cause: error});
}
