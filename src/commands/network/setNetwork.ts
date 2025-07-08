import {AiProviders} from "@/lib/config/simulator";
import {BaseAction} from "../../lib/actions/BaseAction";
import inquirer, {DistinctQuestion} from "inquirer";
import {localnet, studionet, testnetAsimov} from "genlayer-js/chains";
import {} from "genlayer-js/chains";

const networks = [
  {
    name: localnet.name,
    alias: "localnet",
    value: localnet,
  },
  {
    name: studionet.name,
    alias: "studionet",
    value: studionet,
  },
  {
    name: testnetAsimov.name,
    alias: "testnet-asimov",
    value: testnetAsimov,
  },
];

export class NetworkActions extends BaseAction {
  constructor() {
    super();
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
      this.writeConfig("network", JSON.stringify(selectedNetwork.value));
      this.succeedSpinner(`Network successfully set to ${selectedNetwork.name}`);
      return;
    }

    const networkQuestions: DistinctQuestion[] = [
      {
        type: "list",
        name: "selectedNetwork",
        message: "Select which network do you want to use:",
        choices: networks,
      },
    ];
    const networkAnswer = await inquirer.prompt(networkQuestions);
    const selectedNetwork = networkAnswer.selectedNetwork;

    this.writeConfig("network", JSON.stringify(selectedNetwork));
    this.succeedSpinner(`Network successfully set to ${selectedNetwork.name}`);
  }
}
