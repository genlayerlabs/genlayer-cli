import {BaseAction, BUILT_IN_NETWORKS, resolveNetwork} from "../../lib/actions/BaseAction";
import inquirer, {DistinctQuestion} from "inquirer";

const networks = Object.entries(BUILT_IN_NETWORKS).map(([alias, network]) => ({
  name: network.name,
  alias,
  value: network,
}));

export class NetworkActions extends BaseAction {
  constructor() {
    super();
  }

  async showInfo(): Promise<void> {
    const storedNetwork = this.getConfigByKey("network") || "localnet";
    const network = resolveNetwork(storedNetwork);

    const info: Record<string, string> = {
      alias: storedNetwork,
      name: network.name,
      chainId: network.id?.toString() || "unknown",
      rpc: network.rpcUrls?.default?.http?.[0] || "unknown",
      mainContract: network.consensusMainContract?.address || "not set",
      stakingContract: network.stakingContract?.address || "not set",
    };

    if (network.blockExplorers?.default?.url) {
      info.explorer = network.blockExplorers.default.url;
    }

    this.succeedSpinner("Current network", info);
  }

  async listNetworks(): Promise<void> {
    const currentNetwork = this.getConfigByKey("network") || "localnet";

    console.log("");
    for (const net of networks) {
      const marker = net.alias === currentNetwork ? "*" : " ";
      console.log(`${marker} ${net.alias.padEnd(16)} ${net.name}`);
    }
    console.log("");
  }

  async setNetwork(networkName?: string): Promise<void> {
    if (networkName || networkName === "") {
      if (!networks.some(n => n.name === networkName || n.alias === networkName)) {
        this.failSpinner(`Network ${networkName} not found`);
        return;
      }
      const selectedNetwork = networks.find(n => n.name === networkName || n.alias === networkName);
      if (!selectedNetwork) {
        this.failSpinner(`Network ${networkName} not found`);
        return;
      }
      this.writeConfig("network", selectedNetwork.alias);
      this.succeedSpinner(`Network successfully set to ${selectedNetwork.name}`);
      return;
    }

    const networkQuestions: DistinctQuestion[] = [
      {
        type: "list",
        name: "selectedNetwork",
        message: "Select which network do you want to use:",
        choices: networks.map(n => ({name: n.name, value: n.alias})),
      },
    ];
    const networkAnswer = await inquirer.prompt(networkQuestions);
    const selectedAlias = networkAnswer.selectedNetwork;
    const selectedNetwork = networks.find(n => n.alias === selectedAlias)!;

    this.writeConfig("network", selectedAlias);
    this.succeedSpinner(`Network successfully set to ${selectedNetwork.name}`);
  }
}
