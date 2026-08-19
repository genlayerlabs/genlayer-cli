import {BaseAction, BUILT_IN_NETWORKS, resolveNetwork} from "../../lib/actions/BaseAction";
import inquirer, {DistinctQuestion} from "inquirer";
import {
  CONTRACT_OVERRIDES,
  CUSTOM_NETWORKS_CONFIG_KEY,
  getContractAddress,
  isValidAddress,
  normalizeCustomNetworks,
  parseDeploymentFile,
  type ContractOverrideKey,
  type CustomNetworkOverrides,
  type CustomNetworkProfile,
  type CustomNetworksConfig,
} from "../../lib/networks/customNetworks";
import type {Address, GenLayerChain} from "genlayer-js/types";

const builtInNetworks = Object.entries(BUILT_IN_NETWORKS).map(([alias, network]) => ({
  name: network.name,
  alias,
  type: "built-in" as const,
}));

const CONTRACT_FLAG_OPTIONS: Array<{
  optionKey: keyof AddNetworkOptions;
  overrideKey: ContractOverrideKey;
  label: string;
}> = [
  {optionKey: "consensusMain", overrideKey: "consensusMain", label: "--consensus-main"},
  {optionKey: "consensusData", overrideKey: "consensusData", label: "--consensus-data"},
  {optionKey: "staking", overrideKey: "staking", label: "--staking"},
  {optionKey: "feeManager", overrideKey: "feeManager", label: "--fee-manager"},
  {optionKey: "roundsStorage", overrideKey: "roundsStorage", label: "--rounds-storage"},
  {optionKey: "appeals", overrideKey: "appeals", label: "--appeals"},
];

export interface AddNetworkOptions {
  base: string;
  deployment?: string;
  deploymentKey?: string;
  rpc?: string;
  consensusMain?: string;
  consensusData?: string;
  staking?: string;
  feeManager?: string;
  roundsStorage?: string;
  appeals?: string;
  chainId?: string;
}

type NetworkEntry =
  | {alias: string; name: string; type: "built-in"}
  | {alias: string; name: string; type: "custom"; base: string; profile: CustomNetworkProfile};

export class NetworkActions extends BaseAction {
  constructor() {
    super();
  }

  async addNetwork(alias: string, options: AddNetworkOptions): Promise<void> {
    try {
      const customNetworks = this.readCustomNetworks();
      const profile = this.buildCustomNetworkProfile(alias, options, customNetworks);
      customNetworks[alias] = profile;
      this.writeConfig(CUSTOM_NETWORKS_CONFIG_KEY, customNetworks);

      const network = resolveNetwork(alias, customNetworks);
      this.succeedSpinner("Custom network profile added", this.formatNetworkInfo(alias, network, profile));
    } catch (error: any) {
      this.failSpinner("Failed to add custom network profile", error.message || error);
    }
  }

  async showInfo(): Promise<void> {
    const storedNetwork = this.getConfigByKey("network") || "localnet";
    const customNetworks = this.readCustomNetworks();
    const network = resolveNetwork(storedNetwork, customNetworks);
    const profile = customNetworks[storedNetwork];

    this.succeedSpinner("Current network", this.formatNetworkInfo(storedNetwork, network, profile));
  }

  async listNetworks(): Promise<void> {
    const currentNetwork = this.getConfigByKey("network") || "localnet";
    const entries = this.getNetworkEntries();

    console.log("");
    for (const net of entries) {
      const marker = net.alias === currentNetwork ? "*" : " ";
      if (net.type === "custom") {
        console.log(`${marker} ${net.alias.padEnd(20)} custom   base: ${net.base}   ${net.name}`);
      } else {
        console.log(`${marker} ${net.alias.padEnd(20)} built-in ${net.name}`);
      }
    }
    console.log("");
  }

  async setNetwork(networkName?: string): Promise<void> {
    const entries = this.getNetworkEntries();

    if (networkName) {
      const selectedNetwork = entries.find(n =>
        n.alias === networkName || (n.type === "built-in" && n.name === networkName),
      );
      if (!selectedNetwork) {
        this.failSpinner(`Network ${networkName} not found`);
        return;
      }
      this.writeConfig("network", selectedNetwork.alias);
      this.succeedSpinner(`Network successfully set to ${this.getNetworkDisplayName(selectedNetwork)}`);
      return;
    }

    const networkQuestions: DistinctQuestion[] = [
      {
        type: "list",
        name: "selectedNetwork",
        message: "Select which network do you want to use:",
        choices: entries.map(n => ({
          name: this.getNetworkChoiceName(n),
          value: n.alias,
        })),
      },
    ];
    const networkAnswer = await inquirer.prompt(networkQuestions);
    const selectedAlias = networkAnswer.selectedNetwork;
    const selectedNetwork = entries.find(n => n.alias === selectedAlias)!;

    this.writeConfig("network", selectedAlias);
    this.succeedSpinner(`Network successfully set to ${this.getNetworkDisplayName(selectedNetwork)}`);
  }

  async removeNetwork(alias: string): Promise<void> {
    try {
      if (BUILT_IN_NETWORKS[alias]) {
        throw new Error(`Cannot remove built-in network: ${alias}`);
      }

      const customNetworks = this.readCustomNetworks();
      if (!customNetworks[alias]) {
        throw new Error(`Custom network ${alias} not found`);
      }

      delete customNetworks[alias];
      this.writeConfig(CUSTOM_NETWORKS_CONFIG_KEY, customNetworks);

      if ((this.getConfigByKey("network") || "localnet") === alias) {
        this.writeConfig("network", "localnet");
        this.logWarning(`Removed active network ${alias}; active network reset to localnet.`);
      }

      this.succeedSpinner(`Custom network ${alias} removed`);
    } catch (error: any) {
      this.failSpinner("Failed to remove custom network profile", error.message || error);
    }
  }

  private buildCustomNetworkProfile(
    alias: string,
    options: AddNetworkOptions,
    customNetworks: CustomNetworksConfig,
  ): CustomNetworkProfile {
    if (BUILT_IN_NETWORKS[alias]) {
      throw new Error(`Custom network alias cannot collide with built-in network: ${alias}`);
    }
    if (customNetworks[alias]) {
      throw new Error(`Custom network ${alias} already exists`);
    }
    if (!options.base || !BUILT_IN_NETWORKS[options.base]) {
      throw new Error(`Base network must be one of: ${Object.keys(BUILT_IN_NETWORKS).join(", ")}`);
    }

    const hasOverrideInput = Boolean(
      options.deployment ||
      options.rpc ||
      options.chainId !== undefined ||
      CONTRACT_FLAG_OPTIONS.some(option => Boolean(options[option.optionKey])),
    );
    if (!hasOverrideInput) {
      throw new Error("Provide at least one override: --deployment, --rpc, --chain-id, or a contract address flag");
    }

    const overrides: CustomNetworkOverrides = {};
    if (options.deployment) {
      const parsed = parseDeploymentFile(options.deployment, options.deploymentKey);
      Object.assign(overrides, parsed.overrides);
      for (const notice of parsed.notices) {
        this.logInfo(notice);
      }
    }

    for (const option of CONTRACT_FLAG_OPTIONS) {
      const address = options[option.optionKey];
      if (!address) continue;
      if (!isValidAddress(address)) {
        throw new Error(`Invalid address for ${option.label}: ${address}`);
      }
      overrides[option.overrideKey] = address as Address;
    }

    if (options.rpc) {
      overrides.rpcUrl = options.rpc;
    }

    if (options.chainId !== undefined) {
      const chainId = Number(options.chainId);
      if (!Number.isInteger(chainId) || chainId <= 0) {
        throw new Error(`Invalid --chain-id value: ${options.chainId}`);
      }
      overrides.chainId = chainId;
    }

    return {
      base: options.base,
      overrides,
    };
  }

  private formatNetworkInfo(
    alias: string,
    network: GenLayerChain,
    profile?: CustomNetworkProfile,
  ): Record<string, string> {
    const info: Record<string, string> = {
      alias,
      type: profile ? "custom" : "built-in",
    };

    if (profile) {
      info.base = profile.base;
    }

    info.name = network.name;
    info.chainId = this.formatInheritedValue(network.id?.toString() || "unknown", Boolean(profile?.overrides.chainId), profile);
    info.rpc = this.formatInheritedValue(network.rpcUrls?.default?.http?.[0] || "unknown", Boolean(profile?.overrides.rpcUrl), profile);

    for (const contract of CONTRACT_OVERRIDES) {
      const address = getContractAddress(network, contract.overrideKey) || "not set";
      info[contract.label] = this.formatInheritedValue(address, Boolean(profile?.overrides[contract.overrideKey]), profile);
    }

    if (network.blockExplorers?.default?.url) {
      info.explorer = network.blockExplorers.default.url;
    }

    return info;
  }

  private formatInheritedValue(value: string, overridden: boolean, profile?: CustomNetworkProfile): string {
    if (!profile) return value;
    return `${value} (${overridden ? "overridden" : "inherited"})`;
  }

  private getNetworkEntries(): NetworkEntry[] {
    const customNetworks = this.readCustomNetworks();
    const customEntries = Object.entries(customNetworks).map(([alias, profile]) => {
      const network = resolveNetwork(alias, customNetworks);
      return {
        alias,
        name: network.name,
        type: "custom" as const,
        base: profile.base,
        profile,
      };
    });

    return [...builtInNetworks, ...customEntries];
  }

  private getNetworkChoiceName(entry: NetworkEntry): string {
    if (entry.type === "custom") {
      return `${entry.alias} (custom, base: ${entry.base})`;
    }
    return entry.name;
  }

  private getNetworkDisplayName(entry: NetworkEntry): string {
    if (entry.type === "custom") {
      return `${entry.alias} (custom)`;
    }
    return entry.name;
  }

  private readCustomNetworks(): CustomNetworksConfig {
    return normalizeCustomNetworks(this.getConfigByKey(CUSTOM_NETWORKS_CONFIG_KEY));
  }
}
