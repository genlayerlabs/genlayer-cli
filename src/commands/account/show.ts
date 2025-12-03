import {BaseAction, resolveNetwork} from "../../lib/actions/BaseAction";
import {formatEther} from "viem";
import {createClient} from "genlayer-js";
import type {GenLayerChain, Address} from "genlayer-js/types";
import {readFileSync, existsSync} from "fs";
import {KeystoreData} from "../../lib/interfaces/KeystoreData";

export class ShowAccountAction extends BaseAction {
  constructor() {
    super();
  }

  private getNetwork(): GenLayerChain {
    return resolveNetwork(this.getConfig().network);
  }

  async execute(): Promise<void> {
    this.startSpinner("Fetching account info...");

    try {
      const keypairPath = this.getConfigByKey("keyPairPath");

      if (!keypairPath || !existsSync(keypairPath)) {
        this.failSpinner("No account found. Run 'genlayer account create' first.");
        return;
      }

      const keystoreData: KeystoreData = JSON.parse(readFileSync(keypairPath, "utf-8"));

      if (!this.isValidKeystoreFormat(keystoreData)) {
        this.failSpinner("Invalid keystore format.");
        return;
      }

      const address = keystoreData.address as Address;
      const network = this.getNetwork();

      const client = createClient({
        chain: network,
        account: address,
      });

      const balance = await client.getBalance({address});
      const formattedBalance = formatEther(balance);

      const isUnlocked = await this.keychainManager.getPrivateKey();

      const result = {
        address,
        balance: `${formattedBalance} GEN`,
        network: network.name || "localnet",
        status: isUnlocked ? "unlocked" : "locked",
      };

      this.succeedSpinner("Account info", result);
    } catch (error: any) {
      this.failSpinner("Failed to get account info", error.message || error);
    }
  }
}
