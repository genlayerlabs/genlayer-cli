import {isSuccessful} from "genlayer-js";
import {ExecutionResult, TransactionStatus, transactionsStatusNumberToName} from "genlayer-js/types";

function directField(value: unknown, names: string[]): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(record, name)) return record[name];
  }
  return undefined;
}

function normalizeExecutionResult(value: unknown): ExecutionResult | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") {
    const normalized = value.toUpperCase();
    if (normalized === ExecutionResult.FINISHED_WITH_RETURN) return ExecutionResult.FINISHED_WITH_RETURN;
    if (normalized === ExecutionResult.FINISHED_WITH_ERROR) return ExecutionResult.FINISHED_WITH_ERROR;
    if (normalized === ExecutionResult.NOT_VOTED) return ExecutionResult.NOT_VOTED;
    if (normalized === ExecutionResult.TIMEOUT) return ExecutionResult.TIMEOUT;
    if (normalized === ExecutionResult.NONDET_DISAGREE) return ExecutionResult.NONDET_DISAGREE;
    if (normalized === "NONDET_DISAGREE" || normalized === "NONDET_DISAGREEMENT") return ExecutionResult.NONDET_DISAGREE;
    if (normalized === "SUCCESS") return ExecutionResult.FINISHED_WITH_RETURN;
    if (normalized === "ERROR" || normalized === "FAILURE") return ExecutionResult.FINISHED_WITH_ERROR;
    if (/^\d+$/.test(normalized)) return normalizeExecutionResult(Number(normalized));
  }
  if (typeof value === "number" || typeof value === "bigint") {
    const numeric = Number(value);
    if (numeric === 0) return ExecutionResult.NOT_VOTED;
    if (numeric === 1) return ExecutionResult.FINISHED_WITH_RETURN;
    if (numeric === 2) return ExecutionResult.FINISHED_WITH_ERROR;
    if (numeric === 3) return ExecutionResult.TIMEOUT;
    if (numeric === 4) return ExecutionResult.NONDET_DISAGREE;
  }
  return undefined;
}

function normalizeConsensusStatus(value: unknown): TransactionStatus | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") {
    const normalized = value.toUpperCase();
    if (normalized in TransactionStatus) return normalized as TransactionStatus;
    if (/^\d+$/.test(normalized)) return normalizeConsensusStatus(Number(normalized));
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return transactionsStatusNumberToName[String(value) as keyof typeof transactionsStatusNumberToName];
  }
  return undefined;
}

function receiptData(receipt: unknown): {
  record: Record<string, unknown>;
  data: unknown;
  firstLeaderReceipt: unknown;
  genvmResult: unknown;
} {
  const record = receipt && typeof receipt === "object" && !Array.isArray(receipt)
    ? receipt as Record<string, unknown>
    : {};
  const data = directField(record, ["data"]);
  const consensusData =
    directField(data, ["consensus_data", "consensusData"]) ??
    directField(record, ["consensus_data", "consensusData"]);
  const leaderReceipt = directField(consensusData, ["leader_receipt", "leaderReceipt"]);
  const firstLeaderReceipt = Array.isArray(leaderReceipt) ? leaderReceipt[0] : leaderReceipt;
  const genvmResult = directField(firstLeaderReceipt, ["genvm_result", "genvmResult"]);
  return {record, data, firstLeaderReceipt, genvmResult};
}

export function transactionConsensusStatus(receipt: unknown): TransactionStatus | undefined {
  const {record, data} = receiptData(receipt);
  const candidates = [
    directField(record, ["statusName", "status_name"]),
    directField(record, ["status"]),
    directField(data, ["statusName", "status_name"]),
    directField(data, ["status"]),
  ];
  for (const candidate of candidates) {
    const status = normalizeConsensusStatus(candidate);
    if (status !== undefined) return status;
  }
  return undefined;
}

function transactionExecutionResult(receipt: unknown): ExecutionResult | undefined {
  const {record, data, firstLeaderReceipt, genvmResult} = receiptData(receipt);
  const candidates = [
    directField(record, ["txExecutionResultName", "tx_execution_result_name"]),
    directField(record, ["txExecutionResult", "tx_execution_result"]),
    directField(data, ["txExecutionResultName", "tx_execution_result_name"]),
    directField(data, ["txExecutionResult", "tx_execution_result"]),
    directField(firstLeaderReceipt, ["execution_result", "executionResult"]),
    directField(genvmResult, ["execution_result", "executionResult"]),
    directField(data, ["execution_result", "executionResult"]),
  ];
  for (const candidate of candidates) {
    const result = normalizeExecutionResult(candidate);
    if (result !== undefined) return result;
  }
  return undefined;
}

function consensusDiagnosis(status: TransactionStatus | undefined): string {
  if (status === TransactionStatus.UNDETERMINED) return "UNDETERMINED (no validator majority)";
  if (status === TransactionStatus.CANCELED) return "CANCELED before execution";
  if (status === TransactionStatus.LEADER_TIMEOUT) return "LEADER_TIMEOUT";
  if (status === TransactionStatus.VALIDATORS_TIMEOUT) return "VALIDATORS_TIMEOUT";
  return status ?? "UNKNOWN";
}

function executionDiagnosis(result: ExecutionResult | undefined): string {
  if (result === ExecutionResult.TIMEOUT) return "TIMEOUT (leader timed out during execution)";
  if (result === ExecutionResult.NONDET_DISAGREE) {
    return "NONDET_DISAGREE (validators disagreed on non-deterministic output)";
  }
  return result ?? "UNKNOWN";
}

export function assertSuccessfulExecution(
  operation: string,
  hash: unknown,
  receipt: unknown,
): void {
  const status = transactionConsensusStatus(receipt);
  const result = transactionExecutionResult(receipt);
  if (isSuccessful(receipt as any) || isSuccessful({
    ...(receipt && typeof receipt === "object" && !Array.isArray(receipt) ? receipt as Record<string, unknown> : {}),
    statusName: status,
    txExecutionResultName: result,
  } as any)) {
    return;
  }

  const decidedAs = consensusDiagnosis(status);

  if (result === undefined) {
    throw new Error(
      `${operation} ${String(hash)} transaction was decided as ${decidedAs}; leader execution result: UNKNOWN.`,
    );
  }

  throw new Error(
    `${operation} ${String(hash)} transaction was decided as ${decidedAs}; leader execution result: ${executionDiagnosis(result)}.`,
  );
}
