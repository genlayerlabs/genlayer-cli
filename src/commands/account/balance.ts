import {BaseAction, resolveNetwork} from "../../lib/actions/BaseAction";
import {formatEther} from "viem";
import {createClient} from "genlayer-js";
import type {GenLayerChain, Address} from "genlayer-js/types";
import {readFileSync, existsSync} from "fs";

export interface GetBalanceOptions {
  rpc?: string;
  account?: string;
}

export class GetBalanceAction extends BaseAction {
  constructor() {
    super();
  }

  private getNetwork(): GenLayerChain {
    return resolveNetwork(this.getConfig().network);
  }

  async execute(options?: GetBalanceOptions): Promise<void> {
    this.startSpinner("Fetching account balance...");

    try {
      if (options?.account) {
        this.accountOverride = options.account;
      }

      const accountName = this.resolveAccountName();
      const keystorePath = this.getKeystorePath(accountName);

      if (!existsSync(keystorePath)) {
        this.failSpinner(`Account '${accountName}' not found. Run 'genlayer account create --name ${accountName}' first.`);
        return;
      }

      const keystoreData = JSON.parse(readFileSync(keystorePath, "utf-8"));

      if (!this.isValidKeystoreFormat(keystoreData)) {
        this.failSpinner("Invalid keystore format.");
        return;
      }

      const rawAddr = keystoreData.address;
      const address = (rawAddr.startsWith("0x") ? rawAddr : `0x${rawAddr}`) as Address;
      const network = this.getNetwork();

      const client = createClient({
        chain: network,
        account: address,
        endpoint: options?.rpc,
      });

      const balance = await client.getBalance({address});
      const formattedBalance = formatEther(balance);

      const result = {
        account: accountName,
        address,
        balance: `${formattedBalance} GEN`,
        network: network.name || "localnet",
      };

      this.succeedSpinner("Account balance", result);
    } catch (error: any) {
      this.failSpinner("Failed to get account balance", error.message || error);
    }
  }
}
