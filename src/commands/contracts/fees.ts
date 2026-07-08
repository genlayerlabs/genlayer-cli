import fs from "fs";
import path from "path";
import {DEPLOY_CALL_KEY, deriveExternalMessageCallKey, deriveInternalMessageCallKey} from "genlayer-js";

export interface ContractFeeCliOptions {
  fees?: string;
  feeProfile?: string;
  feePreset?: string;
  appealRounds?: string;
  feeValue?: string;
  validUntil?: string;
}

export type FeeProfileTarget = {kind: "deploy"} | {kind: "method"; method: string};

type FeeParseConfig = {
  deployTargeted?: boolean;
  profileTarget?: FeeProfileTarget;
};

const FEE_PROFILE_PRESET_APPEAL_ROUNDS: Record<string, string> = {
  low: "0",
  standard: "1",
  high: "2",
};

const FEE_PROFILE_FIELDS = [
  "leaderTimeunitsAllocation",
  "validatorTimeunitsAllocation",
  "executionBudgetPerRound",
  "executionConsumed",
  "totalMessageFees",
  "maxPriceGenPerTimeUnit",
  "storageFeeMaxGasPrice",
  "receiptFeeMaxGasPrice",
];

const parseJsonObject = (value: string, optionName: string): Record<string, any> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(`${optionName} must be valid JSON.`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${optionName} must be a JSON object.`);
  }

  assertSafeJsonNumbers(parsed, optionName);
  return parsed as Record<string, any>;
};

const assertSafeJsonNumbers = (value: unknown, path: string): void => {
  if (typeof value === "number" && !Number.isSafeInteger(value)) {
    throw new Error(`${path} contains an unsafe number. Quote large integer values as strings.`);
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSafeJsonNumbers(item, `${path}[${index}]`));
    return;
  }

  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      assertSafeJsonNumbers(item, `${path}.${key}`);
    }
  }
};

const parseBigNumberishOption = (value: string | undefined, optionName: string): string | undefined => {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!/^(0x[0-9a-fA-F]+|[0-9]+)$/.test(trimmed)) {
    throw new Error(`${optionName} must be a non-negative integer.`);
  }
  return trimmed;
};

const toSafeNonNegativeNumber = (value: string, optionName: string): number => {
  const parsed = BigInt(value);
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${optionName} is too large.`);
  }
  return Number(parsed);
};

const parseProfilePresetAppealRounds = (options: ContractFeeCliOptions): string => {
  const preset = options.feePreset ?? "standard";
  const appealRounds = FEE_PROFILE_PRESET_APPEAL_ROUNDS[preset];
  if (appealRounds === undefined) {
    throw new Error("--fee-preset must be one of: low, standard, high.");
  }
  return appealRounds;
};

const normalizeMessageType = (messageType: unknown, index: number): 0 | 1 | undefined => {
  if (messageType === undefined) {
    return undefined;
  }

  if (typeof messageType === "number") {
    if (messageType === 0 || messageType === 1) {
      return messageType;
    }
    throw new Error(
      `--fees.messageAllocations[${index}].messageType must be "internal", "external", 0, or 1.`,
    );
  }

  if (typeof messageType !== "string") {
    return undefined;
  }

  const normalized = messageType.toLowerCase();
  if (normalized === "internal") {
    return 1;
  }
  if (normalized === "external") {
    return 0;
  }
  throw new Error(`--fees.messageAllocations[${index}].messageType must be "internal" or "external".`);
};

const readStringField = (allocation: Record<string, any>, field: string, index: number): string => {
  const value = allocation[field];
  if (typeof value !== "string") {
    throw new Error(`--fees.messageAllocations[${index}].${field} must be a string.`);
  }
  return value;
};

const assertFourByteSelector = (selector: string, field: string, index: number): void => {
  if (!/^0x[0-9a-fA-F]{8}$/.test(selector)) {
    throw new Error(`--fees.messageAllocations[${index}].${field} must be a 4-byte hex selector.`);
  }
};

const assertHexBytes = (hex: string, field: string, index: number): void => {
  if (!/^0x([0-9a-fA-F]{2})*$/.test(hex)) {
    throw new Error(`--fees.messageAllocations[${index}].${field} must be even-length hex bytes.`);
  }
};

const normalizeMessageAllocationCallKey = (
  allocation: Record<string, any>,
  messageType: 0 | 1 | undefined,
  index: number,
): Record<string, any> => {
  const helperFields = ["callKeyMethod", "callKeySelector", "callKeyCalldata", "functionSelector"].filter(
    field => allocation[field] !== undefined,
  );

  if (allocation.callKey !== undefined && helperFields.length > 0) {
    throw new Error(
      `--fees.messageAllocations[${index}] cannot combine callKey with call-key helper fields.`,
    );
  }
  if (helperFields.length > 1) {
    throw new Error(`--fees.messageAllocations[${index}] must use only one call-key helper field.`);
  }

  const {callKeyMethod, callKeySelector, callKeyCalldata, functionSelector, ...normalized} = allocation;

  if (helperFields.length === 0) {
    return normalized;
  }

  const helperField = helperFields[0];
  if (helperField === "callKeyMethod") {
    if (messageType === 0) {
      throw new Error(
        `--fees.messageAllocations[${index}].callKeyMethod requires an internal message allocation.`,
      );
    }
    normalized.messageType = messageType ?? 1;
    normalized.callKey = deriveInternalMessageCallKey(readStringField(allocation, helperField, index));
    return normalized;
  }

  if (messageType === 1) {
    throw new Error(
      `--fees.messageAllocations[${index}].${helperField} requires an external message allocation.`,
    );
  }

  const selectorOrCalldata = readStringField(allocation, helperField, index);
  if (helperField === "callKeySelector" || helperField === "functionSelector") {
    assertFourByteSelector(selectorOrCalldata, helperField, index);
  } else {
    assertHexBytes(selectorOrCalldata, helperField, index);
  }
  normalized.messageType = messageType ?? 0;
  normalized.callKey = deriveExternalMessageCallKey(selectorOrCalldata as `0x${string}`);
  return normalized;
};

const normalizeMessageTypes = (fees: Record<string, any>, deployTargeted = false): Record<string, any> => {
  if (!Array.isArray(fees.messageAllocations)) {
    return fees;
  }

  return {
    ...fees,
    messageAllocations: fees.messageAllocations.map((allocation: any, index: number) => {
      if (!allocation || typeof allocation !== "object" || Array.isArray(allocation)) {
        throw new Error(`--fees.messageAllocations[${index}] must be an object.`);
      }

      const messageType = normalizeMessageType(allocation.messageType, index);
      const normalized = normalizeMessageAllocationCallKey(
        {
          ...allocation,
          ...(messageType === undefined ? {} : {messageType}),
        },
        messageType,
        index,
      );
      if (deployTargeted && normalized.callKey === undefined) {
        normalized.callKey = DEPLOY_CALL_KEY;
      }
      return normalized;
    }),
  };
};

const flattenFeeEstimateOptions = (
  parsed: Record<string, any>,
  config: FeeParseConfig = {},
): Record<string, any> => {
  const normalized = normalizeMessageTypes(parsed, config.deployTargeted);
  if (
    normalized.distribution &&
    typeof normalized.distribution === "object" &&
    !Array.isArray(normalized.distribution)
  ) {
    const {distribution, messageAllocations, ...rest} = normalized;
    return {
      ...distribution,
      ...(messageAllocations !== undefined ? {messageAllocations} : {}),
      ...rest,
    };
  }
  return normalized;
};

const readFeeProfile = (profilePath: string): Record<string, any> => {
  const resolvedPath = path.resolve(profilePath);
  let content: string;
  try {
    content = fs.readFileSync(resolvedPath, "utf-8");
  } catch (error) {
    throw new Error(`Unable to read --fee-profile at ${resolvedPath}.`);
  }
  return parseJsonObject(content, "--fee-profile");
};

const feeProfileEntry = (profile: Record<string, any>, target: FeeProfileTarget): Record<string, any> => {
  const entry = target.kind === "deploy" ? profile.deploy : profile.methods?.[target.method];

  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    const targetLabel = target.kind === "deploy" ? "deploy" : `method "${target.method}"`;
    throw new Error(`--fee-profile does not contain a fee profile for ${targetLabel}.`);
  }
  return entry;
};

const profileEntryToEstimateOptions = (
  entry: Record<string, any>,
  options: ContractFeeCliOptions,
): Record<string, any> => {
  assertSafeJsonNumbers(entry, "--fee-profile entry");
  const result: Record<string, any> = {};

  for (const key of FEE_PROFILE_FIELDS) {
    if (entry[key] !== undefined) {
      result[key] = entry[key];
    }
  }

  if (entry.messageAllocations !== undefined) {
    result.messageAllocations = entry.messageAllocations;
  }

  if (entry.rotations !== undefined) {
    result.rotations = entry.rotations;
    if (entry.appealRounds !== undefined) {
      result.appealRounds = entry.appealRounds;
    }
    return result;
  }

  const appealRounds = parseBigNumberishOption(
    options.appealRounds ?? entry.appealRounds?.toString() ?? parseProfilePresetAppealRounds(options),
    "--appeal-rounds",
  )!;
  const rotationsPerRound = parseBigNumberishOption(
    entry.rotationsPerRound?.toString() ?? "0",
    "--fee-profile rotationsPerRound",
  )!;
  const rotationCount = toSafeNonNegativeNumber(appealRounds, "--appeal-rounds") + 1;

  result.appealRounds = appealRounds;
  result.rotations = Array(rotationCount).fill(rotationsPerRound);
  return result;
};

const parseProfileEstimateOptions = (
  options: ContractFeeCliOptions,
  config: FeeParseConfig = {},
): Record<string, any> | undefined => {
  if (!options.feeProfile) {
    return undefined;
  }

  const target = config.profileTarget ?? {kind: "deploy" as const};
  return flattenFeeEstimateOptions(
    profileEntryToEstimateOptions(feeProfileEntry(readFeeProfile(options.feeProfile), target), options),
    config,
  );
};

export const parseTransactionFees = (
  options: ContractFeeCliOptions,
  config: FeeParseConfig = {},
): Record<string, any> | undefined => {
  const feeValue = parseBigNumberishOption(options.feeValue, "--fee-value");
  let fees = options.fees ? parseJsonObject(options.fees, "--fees") : undefined;

  if (!fees && feeValue === undefined) {
    return undefined;
  }

  fees = normalizeMessageTypes(fees ?? {}, config.deployTargeted);
  if (feeValue !== undefined) {
    fees.feeValue = feeValue;
  }
  return fees;
};

export const parseFeeEstimateOptions = (
  options: Pick<ContractFeeCliOptions, "fees" | "feeProfile" | "feePreset" | "appealRounds">,
  config: FeeParseConfig = {},
): Record<string, any> | undefined => {
  const profileOptions = parseProfileEstimateOptions(options, config);
  if (!options.fees) {
    return profileOptions;
  }

  const explicitOptions = flattenFeeEstimateOptions(parseJsonObject(options.fees, "--fees"), config);
  if (!profileOptions) {
    return explicitOptions;
  }
  return {
    ...profileOptions,
    ...explicitOptions,
  };
};

export const toTransactionFees = (estimate: Record<string, any>): Record<string, any> => ({
  distribution: estimate.distribution,
  ...(estimate.messageAllocations ? {messageAllocations: estimate.messageAllocations} : {}),
  feeValue: estimate.feeValue ?? estimate.fee_value,
});

export const resolveTransactionFees = async (
  client: {estimateTransactionFees?: (options?: Record<string, any>) => Promise<Record<string, any>>},
  options: ContractFeeCliOptions,
  config: FeeParseConfig = {},
): Promise<Record<string, any> | undefined> => {
  if (!options.feeProfile) {
    return parseTransactionFees(options, config);
  }

  if (typeof client.estimateTransactionFees !== "function") {
    throw new Error("The active genlayer-js client does not support fee profile estimation.");
  }

  const estimateOptions = parseFeeEstimateOptions(options, config);
  const transactionFees = toTransactionFees(await client.estimateTransactionFees(estimateOptions));
  const feeValue = parseBigNumberishOption(options.feeValue, "--fee-value");
  if (feeValue !== undefined) {
    transactionFees.feeValue = feeValue;
  }
  return transactionFees;
};

export const parseValidUntil = (options: ContractFeeCliOptions): string | undefined => {
  return parseBigNumberishOption(options.validUntil, "--valid-until");
};
