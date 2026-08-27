import {TransactionStatus, transactionsStatusNumberToName, type GenLayerTransaction} from "genlayer-js/types";

export type TransactionPresentation = {
  state: "processing" | "decided" | "finalized" | "canceled";
  phase?: string;
  outcome?: string;
  label: string;
};

type LifecycleSummary =
  | {state: "processing"; phase: string}
  | {state: "decided"; outcome: string}
  | {state: "finalized"; outcome?: string}
  | {state: "canceled"};

const PROCESSING_PHASES: Partial<Record<TransactionStatus, string>> = {
  [TransactionStatus.UNINITIALIZED]: "Waiting to start",
  [TransactionStatus.PENDING]: "Pending activation",
  [TransactionStatus.PROPOSING]: "Proposal",
  [TransactionStatus.COMMITTING]: "Voting",
  [TransactionStatus.REVEALING]: "Vote reveal",
  [TransactionStatus.APPEAL_COMMITTING]: "Appeal voting",
  [TransactionStatus.APPEAL_REVEALING]: "Appeal reveal",
  [TransactionStatus.LEADER_REVEALING]: "Leader reveal",
};

const DECISION_OUTCOMES: Partial<Record<TransactionStatus, string>> = {
  [TransactionStatus.ACCEPTED]: "Accepted",
  [TransactionStatus.UNDETERMINED]: "Undetermined",
  [TransactionStatus.VALIDATORS_TIMEOUT]: "Validator timeout",
  [TransactionStatus.LEADER_TIMEOUT]: "Leader timeout",
};

const FINALIZED_OUTCOMES: Record<string, string> = {
  SUCCESS: "Succeeded",
  FINISHED_WITH_RETURN: "Succeeded",
  FAILURE: "Failed",
  FINISHED_WITH_ERROR: "Failed",
  TIMEOUT: "Timed out",
  NOT_VOTED: "Timed out",
  NONDET_DISAGREE: "Undetermined",
  DETERMINISTIC_VIOLATION: "Deterministic violation",
};

function humanize(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map(word => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}

function label(state: string, detail?: string): string {
  return detail ? `${state} · ${detail}` : state;
}

function fromLifecycle(lifecycle: LifecycleSummary): TransactionPresentation {
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

function statusName(transaction: GenLayerTransaction): TransactionStatus {
  const legacy = transaction as GenLayerTransaction & {
    storedStatusName?: TransactionStatus;
    storedStatus?: number;
    statusName?: TransactionStatus;
    status?: string | number;
  };

  if (legacy.storedStatusName) return legacy.storedStatusName;
  if (typeof legacy.storedStatus === "number") {
    return transactionsStatusNumberToName[legacy.storedStatus as keyof typeof transactionsStatusNumberToName];
  }
  if (legacy.statusName) return legacy.statusName;
  if (typeof legacy.status === "string") {
    return legacy.status.toUpperCase() as TransactionStatus;
  }
  if (typeof legacy.status === "number") {
    return transactionsStatusNumberToName[legacy.status as keyof typeof transactionsStatusNumberToName];
  }
  return TransactionStatus.UNINITIALIZED;
}

/**
 * Format the SDK's simple lifecycle when available. The train fallback uses
 * storedStatus before the legacy projected status so ordinary output never
 * invents a materialized transition.
 */
export function presentTransaction(transaction: GenLayerTransaction): TransactionPresentation {
  const lifecycle = (transaction as GenLayerTransaction & {lifecycle?: LifecycleSummary}).lifecycle;
  if (lifecycle) return fromLifecycle(lifecycle);

  const status = statusName(transaction);
  if (status === TransactionStatus.CANCELED) {
    return {state: "canceled", label: "Canceled"};
  }
  if (status === TransactionStatus.FINALIZED) {
    const legacy = transaction as GenLayerTransaction & {
      txExecutionResultName?: string;
      resultName?: string;
    };
    const rawOutcome = legacy.txExecutionResultName || legacy.resultName || "COMPLETE";
    const outcome = FINALIZED_OUTCOMES[rawOutcome] || humanize(rawOutcome);
    return {state: "finalized", outcome, label: label("Finalized", outcome)};
  }

  const outcome = DECISION_OUTCOMES[status];
  if (outcome) {
    return {state: "decided", outcome, label: label("Decided", outcome)};
  }

  const phase = PROCESSING_PHASES[status] || "Processing";
  return {state: "processing", phase, label: label("Processing", phase)};
}

const ADVANCED_LIFECYCLE_FIELDS = new Set([
  "lifecycle",
  "currentTimestamp",
  "status",
  "statusName",
  "storedStatus",
  "storedStatusName",
  "resolutionAction",
  "resolutionActionName",
  "canFinalize",
]);

/** Keep receipt data useful while reserving raw lifecycle internals for debug. */
export function withoutAdvancedLifecycle(transaction: GenLayerTransaction): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(transaction).filter(([key]) => !ADVANCED_LIFECYCLE_FIELDS.has(key)),
  );
}
