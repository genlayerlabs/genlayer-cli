import type {GenLayerTransaction, TransactionLifecycle} from "genlayer-js/types";

export type TransactionPresentation = {
  state: "processing" | "decided" | "finalized" | "canceled";
  phase?: string;
  outcome?: string;
  label: string;
};

function humanize(value: string): string {
  return value
    .toLowerCase()
    .split(/[-_]/)
    .filter(Boolean)
    .map(word => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}

function label(state: string, detail?: string): string {
  return detail ? `${state} · ${detail}` : state;
}

function fromLifecycle(lifecycle: TransactionLifecycle): TransactionPresentation {
  if (lifecycle.state === "canceled") {
    return {state: "canceled", label: "Canceled"};
  }
  if (lifecycle.state === "processing") {
    const phase = humanize(lifecycle.phase);
    return {state: "processing", phase, label: label("Processing", phase)};
  }
  if (lifecycle.state === "decided") {
    const outcome = humanize(lifecycle.outcome);
    return {state: "decided", outcome, label: label("Decided", outcome)};
  }
  const outcome = lifecycle.outcome ? humanize(lifecycle.outcome) : "Complete";
  return {state: "finalized", outcome, label: label("Finalized", outcome)};
}

/** Format the SDK's non-projecting, consumer-oriented lifecycle. */
export function presentTransaction(transaction: GenLayerTransaction): TransactionPresentation {
  return fromLifecycle(transaction.lifecycle);
}

const PROTOCOL_LIFECYCLE_FIELDS = new Set(["lifecycle", "status", "statusName"]);

/** Keep receipt data useful while reserving protocol details for `--raw`. */
export function withoutAdvancedLifecycle(transaction: GenLayerTransaction): Record<string, unknown> {
  return Object.fromEntries(Object.entries(transaction).filter(([key]) => !PROTOCOL_LIFECYCLE_FIELDS.has(key)));
}
