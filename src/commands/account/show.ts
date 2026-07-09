import {BaseAction, resolveNetwork} from "../../lib/actions/BaseAction";
import {formatEther} from "viem";
import {createClient} from "genlayer-js";
import type {GenLayerChain, Address} from "genlayer-js/types";
import {readFileSync, existsSync} from "fs";

export interface ShowAccountOptions {
  rpc?: string;
  network?: string;
  account?: string;
}

export class ShowAccountAction extends BaseAction {
  constructor() {
    super();
  }

  private getNetwork(networkOption?: string): GenLayerChain {
    // Priority: --network option > global config network > localnet default.
    if (networkOption) {
      return resolveNetwork(networkOption, this.getCustomNetworks());
    }
    return resolveNetwork(this.getConfig().network, this.getCustomNetworks());
  }

  async execute(options?: ShowAccountOptions): Promise<void> {
    this.startSpinner("Fetching account info...");

    try {
      if (options?.account) {
        this.accountOverride = options.account;
      }

      const accountName = this.resolveAccountName();
      const keystorePath = this.getKeystorePath(accountName);

      if (!existsSync(keystorePath)) {
        this.failSpinner(
          `Account '${accountName}' not found. Run 'genlayer account create --name ${accountName}' first.`,
        );
        return;
      }

      const keystoreData = JSON.parse(readFileSync(keystorePath, "utf-8"));

      if (!this.isValidKeystoreFormat(keystoreData)) {
        this.failSpinner("Invalid keystore format.");
        return;
      }

      const rawAddr = keystoreData.address;
      const address = (rawAddr.startsWith("0x") ? rawAddr : `0x${rawAddr}`) as Address;
      const network = this.getNetwork(options?.network);
      // Label with the ACTIVE network alias (what the user set via `network set`
      // or --network), not chain.name: a custom network inherits its base
      // chain's name ("Genlayer Localnet"), which would mislabel the account.
      const networkAlias = options?.network || this.getConfig().network || "localnet";

      const client = createClient({
        chain: network,
        account: address,
        endpoint: options?.rpc,
      });

      const balance = await client.getBalance({address});
      const formattedBalance = formatEther(balance);

      const isUnlocked = await this.keychainManager.isAccountUnlocked(accountName);
      const isActive = this.getActiveAccount() === accountName;

      const result = {
        name: accountName,
        address,
        balance: `${formattedBalance} GEN`,
        network: networkAlias,
        chainId: network.id,
        status: isUnlocked ? "unlocked" : "locked",
        active: isActive,
      };

      this.succeedSpinner("Account info", result);
    } catch (error: any) {
      this.failSpinner("Failed to get account info", error.message || error);
    }
  }
}
