import {hexToBytes, keccak256, toHex, type Hex} from "viem";

export interface ContractFeeCliOptions {
  fees?: string;
  feeValue?: string;
  validUntil?: string;
}

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

const CALL_KEY_UNNAMED = "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

const bytesToPaddedCallKey = (bytes: Uint8Array): Hex => {
  if (bytes.length > 32) {
    throw new Error("call key source bytes must be 32 bytes or fewer.");
  }
  return `0x${toHex(bytes).slice(2).padEnd(64, "0")}` as Hex;
};

const deriveInternalMessageCallKey = (methodName = ""): Hex => {
  const methodBytes = new TextEncoder().encode(methodName);
  if (methodBytes.length < 32) {
    return bytesToPaddedCallKey(methodBytes);
  }

  const hashed = keccak256(methodBytes);
  const lastByte = Number.parseInt(hashed.slice(-2), 16) | 1;
  return `${hashed.slice(0, -2)}${lastByte.toString(16).padStart(2, "0")}` as Hex;
};

const deriveExternalMessageCallKey = (selectorOrCalldata: Hex): Hex => {
  const bytes = hexToBytes(selectorOrCalldata);
  if (bytes.length < 4) {
    return CALL_KEY_UNNAMED;
  }
  return bytesToPaddedCallKey(bytes.slice(0, 4));
};

const normalizeMessageType = (messageType: unknown, index: number): 0 | 1 | undefined => {
  if (messageType === undefined) {
    return undefined;
  }

  if (typeof messageType === "number") {
    if (messageType === 0 || messageType === 1) {
      return messageType;
    }
    throw new Error(`--fees.messageAllocations[${index}].messageType must be "internal", "external", 0, or 1.`);
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
  const helperFields = [
    "callKeyMethod",
    "callKeySelector",
    "callKeyCalldata",
    "functionSelector",
  ].filter((field) => allocation[field] !== undefined);

  if (allocation.callKey !== undefined && helperFields.length > 0) {
    throw new Error(`--fees.messageAllocations[${index}] cannot combine callKey with call-key helper fields.`);
  }
  if (helperFields.length > 1) {
    throw new Error(`--fees.messageAllocations[${index}] must use only one call-key helper field.`);
  }

  const {
    callKeyMethod,
    callKeySelector,
    callKeyCalldata,
    functionSelector,
    ...normalized
  } = allocation;

  if (helperFields.length === 0) {
    return normalized;
  }

  const helperField = helperFields[0];
  if (helperField === "callKeyMethod") {
    if (messageType === 0) {
      throw new Error(`--fees.messageAllocations[${index}].callKeyMethod requires an internal message allocation.`);
    }
    normalized.messageType = messageType ?? 1;
    normalized.callKey = deriveInternalMessageCallKey(readStringField(allocation, helperField, index));
    return normalized;
  }

  if (messageType === 1) {
    throw new Error(`--fees.messageAllocations[${index}].${helperField} requires an external message allocation.`);
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

const normalizeMessageTypes = (fees: Record<string, any>): Record<string, any> => {
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
      return normalizeMessageAllocationCallKey({
        ...allocation,
        ...(messageType === undefined ? {} : {messageType}),
      }, messageType, index);
    }),
  };
};

export const parseTransactionFees = (options: ContractFeeCliOptions): Record<string, any> | undefined => {
  const feeValue = parseBigNumberishOption(options.feeValue, "--fee-value");
  let fees = options.fees ? parseJsonObject(options.fees, "--fees") : undefined;

  if (!fees && feeValue === undefined) {
    return undefined;
  }

  fees = normalizeMessageTypes(fees ?? {});
  if (feeValue !== undefined) {
    fees.feeValue = feeValue;
  }
  return fees;
};

export const parseFeeEstimateOptions = (options: Pick<ContractFeeCliOptions, "fees">): Record<string, any> | undefined => {
  if (!options.fees) {
    return undefined;
  }

  const parsed = normalizeMessageTypes(parseJsonObject(options.fees, "--fees"));
  if (parsed.distribution && typeof parsed.distribution === "object" && !Array.isArray(parsed.distribution)) {
    const {distribution, messageAllocations, ...rest} = parsed;
    return {
      ...distribution,
      ...(messageAllocations !== undefined ? {messageAllocations} : {}),
      ...rest,
    };
  }
  return parsed;
};

export const parseValidUntil = (options: ContractFeeCliOptions): string | undefined => {
  return parseBigNumberishOption(options.validUntil, "--valid-until");
};
