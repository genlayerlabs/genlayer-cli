export interface ContractTransactionCliOptions {
  /** Gas limit for the outer EVM transaction submitted to ConsensusMain. */
  gas?: string;
}

export const parseGas = (value: string | undefined): bigint | undefined => {
  if (value === undefined) return undefined;

  const trimmed = value.trim();
  if (!/^(0x[0-9a-fA-F]+|[0-9]+)$/.test(trimmed)) {
    throw new Error("--gas must be a positive integer.");
  }

  const gas = BigInt(trimmed);
  if (gas <= 0n) {
    throw new Error("--gas must be a positive integer.");
  }
  return gas;
};
