import {readFileSync} from "fs";
import type {Address, GenLayerChain} from "genlayer-js/types";

export const CUSTOM_NETWORKS_CONFIG_KEY = "customNetworks";
export const ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

export type ContractOverrideKey =
  | "consensusMain"
  | "consensusData"
  | "staking"
  | "feeManager"
  | "roundsStorage"
  | "appeals";

export interface CustomNetworkOverrides {
  rpcUrl?: string;
  chainId?: number;
  consensusMain?: Address;
  consensusData?: Address;
  staking?: Address;
  feeManager?: Address;
  roundsStorage?: Address;
  appeals?: Address;
}

export interface CustomNetworkProfile {
  base: string;
  overrides: CustomNetworkOverrides;
}

export type CustomNetworksConfig = Record<string, CustomNetworkProfile>;

export const CONTRACT_OVERRIDES: Array<{
  overrideKey: ContractOverrideKey;
  chainField: keyof GenLayerChain;
  label: string;
}> = [
  {overrideKey: "consensusMain", chainField: "consensusMainContract", label: "consensusMain"},
  {overrideKey: "consensusData", chainField: "consensusDataContract", label: "consensusData"},
  {overrideKey: "staking", chainField: "stakingContract", label: "staking"},
  {overrideKey: "feeManager", chainField: "feeManagerContract", label: "feeManager"},
  {overrideKey: "roundsStorage", chainField: "roundsStorageContract", label: "roundsStorage"},
  {overrideKey: "appeals", chainField: "appealsContract", label: "appeals"},
];

const DEPLOYMENT_KEY_TO_OVERRIDE: Record<string, ContractOverrideKey> = {
  ConsensusMain: "consensusMain",
  ConsensusData: "consensusData",
  GenStaking: "staking",
  Staking: "staking",
  FeeManager: "feeManager",
  Rounds: "roundsStorage",
  RoundsStorage: "roundsStorage",
  Appeals: "appeals",
};

const CONSENSUS_MAIN_WITH_FEES = "ConsensusMainWithFees";
const SCANNED_DEPLOYMENT_KEYS = new Set([
  ...Object.keys(DEPLOYMENT_KEY_TO_OVERRIDE),
  CONSENSUS_MAIN_WITH_FEES,
]);

interface FoundDeploymentAddress {
  path: string;
  address: string;
}

export interface ParsedDeploymentOverrides {
  overrides: Partial<Pick<
    CustomNetworkOverrides,
    "consensusMain" | "consensusData" | "staking" | "feeManager" | "roundsStorage" | "appeals"
  >>;
  notices: string[];
}

export function normalizeCustomNetworks(value: unknown): CustomNetworksConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as CustomNetworksConfig;
}

export function isValidAddress(value: string): value is Address {
  return ADDRESS_REGEX.test(value);
}

export function parseDeploymentFile(filePath: string, deploymentKey?: string): ParsedDeploymentOverrides {
  const content = readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(content);
  return parseDeploymentObject(parsed, deploymentKey);
}

export function parseDeploymentObject(input: unknown, deploymentKey?: string): ParsedDeploymentOverrides {
  const selected = deploymentKey ? selectDeploymentObject(input, deploymentKey) : input;
  if (!selected || typeof selected !== "object" || Array.isArray(selected)) {
    throw new Error("Deployment selection must be a JSON object");
  }

  const found: Record<string, FoundDeploymentAddress[]> = {};
  walkDeploymentObject(selected, [], found);

  for (const [contractName, entries] of Object.entries(found)) {
    if (entries.length > 1) {
      const paths = entries.map(entry => entry.path).join(", ");
      throw new Error(
        `Ambiguous ${contractName} entries found at ${paths}. ` +
        "Pass --deployment-key <dot.path> to select one deployment.",
      );
    }
  }

  const overrides: ParsedDeploymentOverrides["overrides"] = {};
  const fieldSources: Partial<Record<ContractOverrideKey, string>> = {};

  for (const [contractName, entries] of Object.entries(found)) {
    const entry = entries[0];
    if (!entry) continue;
    if (!isValidAddress(entry.address)) {
      throw new Error(`Invalid address for ${contractName} at ${entry.path}: ${entry.address}`);
    }
    if (contractName === CONSENSUS_MAIN_WITH_FEES) {
      continue;
    }

    const overrideKey = DEPLOYMENT_KEY_TO_OVERRIDE[contractName];
    if (!overrideKey) continue;
    if (fieldSources[overrideKey]) {
      throw new Error(
        `Multiple deployment entries map to ${overrideKey}: ${fieldSources[overrideKey]} and ${contractName}. ` +
        `Use an explicit --${toFlagName(overrideKey)} <addr> override.`,
      );
    }
    overrides[overrideKey] = entry.address as Address;
    fieldSources[overrideKey] = contractName;
  }

  const notices: string[] = [];
  if (found.ConsensusMain?.length && found[CONSENSUS_MAIN_WITH_FEES]?.length) {
    notices.push(
      "ConsensusMainWithFees exists in the deployment file; using ConsensusMain. " +
      "Use --consensus-main <addr> to choose ConsensusMainWithFees.",
    );
  }

  return {overrides, notices};
}

export function applyCustomNetworkProfile(
  baseChain: GenLayerChain,
  profile: CustomNetworkProfile,
): GenLayerChain {
  const chain = cloneChain(baseChain);
  const overrides = profile.overrides || {};

  if (overrides.chainId !== undefined) {
    (chain as any).id = overrides.chainId;
  }

  if (overrides.rpcUrl) {
    const rpcUrls = (chain.rpcUrls || {}) as any;
    const defaultRpc = rpcUrls.default || {};
    const currentHttp = Array.isArray(defaultRpc.http) ? defaultRpc.http : [];
    (chain as any).rpcUrls = {
      ...rpcUrls,
      default: {
        ...defaultRpc,
        http: [overrides.rpcUrl, ...currentHttp.slice(1)],
      },
    };
  }

  for (const contract of CONTRACT_OVERRIDES) {
    const address = overrides[contract.overrideKey];
    if (!address) continue;
    const current = (chain as any)[contract.chainField];
    (chain as any)[contract.chainField] = {
      ...(current || {}),
      address,
    };
  }

  return chain;
}

export function getContractAddress(chain: GenLayerChain, overrideKey: ContractOverrideKey): string | undefined {
  const contract = CONTRACT_OVERRIDES.find(item => item.overrideKey === overrideKey);
  if (!contract) return undefined;
  return (chain as any)[contract.chainField]?.address;
}

function selectDeploymentObject(input: unknown, deploymentKey: string): unknown {
  const segments = deploymentKey.split(".").filter(Boolean);
  if (!segments.length) {
    throw new Error("--deployment-key must not be empty");
  }

  let selected = input as any;
  for (const segment of segments) {
    if (!selected || typeof selected !== "object" || Array.isArray(selected) || !(segment in selected)) {
      throw new Error(`Deployment key not found: ${deploymentKey}`);
    }
    selected = selected[segment];
  }

  return selected;
}

function walkDeploymentObject(
  node: Record<string, unknown>,
  path: string[],
  found: Record<string, FoundDeploymentAddress[]>,
): void {
  for (const [key, value] of Object.entries(node)) {
    const nextPath = [...path, key];
    if (typeof value === "string" && SCANNED_DEPLOYMENT_KEYS.has(key)) {
      if (!found[key]) found[key] = [];
      found[key].push({path: nextPath.join("."), address: value});
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      walkDeploymentObject(value as Record<string, unknown>, nextPath, found);
    }
  }
}

function cloneChain(baseChain: GenLayerChain): GenLayerChain {
  const chain = {...baseChain} as any;

  if (baseChain.rpcUrls) {
    chain.rpcUrls = {};
    for (const [key, value] of Object.entries(baseChain.rpcUrls as any)) {
      chain.rpcUrls[key] = value && typeof value === "object"
        ? {
          ...value,
          http: Array.isArray((value as any).http) ? [...(value as any).http] : (value as any).http,
        }
        : value;
    }
  }

  for (const contract of CONTRACT_OVERRIDES) {
    const current = (baseChain as any)[contract.chainField];
    if (current) {
      chain[contract.chainField] = {...current};
    }
  }

  return chain as GenLayerChain;
}

function toFlagName(overrideKey: ContractOverrideKey): string {
  return overrideKey.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`);
}
