import {BaseAction, BUILT_IN_NETWORKS, resolveNetwork} from "../../lib/actions/BaseAction";
import {parseEther, formatEther} from "viem";
import {createClient, createAccount} from "genlayer-js";
import type {GenLayerChain, Address, Hash} from "genlayer-js/types";
import {readFileSync, existsSync} from "fs";
import {ethers} from "ethers";

export interface SendOptions {
  to: string;
  amount: string;
  rpc?: string;
  network?: string;
  account?: string;
}

export class SendAction extends BaseAction {
  constructor() {
    super();
  }

  private getNetwork(networkOption?: string): GenLayerChain {
    if (networkOption) {
      const network = BUILT_IN_NETWORKS[networkOption];
      if (!network) {
        throw new Error(`Unknown network: ${networkOption}. Available: ${Object.keys(BUILT_IN_NETWORKS).join(", ")}`);
      }
      return network;
    }
    return resolveNetwork(this.getConfig().network);
  }

  private parseAmount(amount: string): bigint {
    // Support "10gen" or "10" (assumes gen) or wei values
    const lowerAmount = amount.toLowerCase();
    if (lowerAmount.endsWith("gen")) {
      const value = lowerAmount.slice(0, -3);
      return parseEther(value);
    }
    // If it's a large number (likely wei), use as-is
    if (BigInt(amount) > 1_000_000_000_000n) {
      return BigInt(amount);
    }
    // Otherwise assume it's in GEN
    return parseEther(amount);
  }

  async execute(options: SendOptions): Promise<void> {
    this.startSpinner("Preparing transfer...");

    try {
      if (options.account) {
        this.accountOverride = options.account;
      }

      const accountName = this.resolveAccountName();
      const keystorePath = this.getKeystorePath(accountName);

      if (!existsSync(keystorePath)) {
        this.failSpinner(`Account '${accountName}' not found. Run 'genlayer account create --name ${accountName}' first.`);
        return;
      }

      const keystoreJson = readFileSync(keystorePath, "utf-8");
      const keystoreData = JSON.parse(keystoreJson);

      if (!this.isValidKeystoreFormat(keystoreData)) {
        this.failSpinner("Invalid keystore format.");
        return;
      }

      // Get private key
      const cachedKey = await this.keychainManager.getPrivateKey(accountName);
      let privateKey: string;

      if (cachedKey) {
        privateKey = cachedKey;
      } else {
        this.stopSpinner();
        const password = await this.promptPassword(`Enter password for '${accountName}':`);
        this.startSpinner("Preparing transfer...");
        const wallet = await ethers.Wallet.fromEncryptedJson(keystoreJson, password);
        privateKey = wallet.privateKey;
      }

      const network = this.getNetwork(options.network);
      const account = createAccount(privateKey as Hash);
      const amount = this.parseAmount(options.amount);

      const client = createClient({
        chain: network,
        account,
        endpoint: options.rpc,
      });

      this.setSpinnerText(`Sending ${formatEther(amount)} GEN to ${options.to}...`);

      // Get nonce
      const nonce = await client.getCurrentNonce({address: account.address});

      // Prepare and sign transaction (let prepareTransactionRequest estimate gas)
      const transactionRequest = await client.prepareTransactionRequest({
        account,
        to: options.to as Address,
        value: amount,
        type: "legacy",
        nonce: Number(nonce),
      });

      const serializedTransaction = await account.signTransaction(transactionRequest);
      const txHash = await client.sendRawTransaction({serializedTransaction});

      this.setSpinnerText(`Transaction submitted: ${txHash}\nWaiting for confirmation...`);

      // Poll for receipt (standard ETH transfer, not GenVM tx)
      let receipt = null;
      for (let i = 0; i < 60; i++) {
        try {
          receipt = await client.getTransactionReceipt({hash: txHash});
          if (receipt) break;
        } catch {
          // Receipt not available yet, continue polling
        }
        await new Promise((r) => setTimeout(r, 2000));
      }

      if (!receipt) {
        // Tx submitted but receipt not found yet - still success
        this.succeedSpinner("Transfer submitted (pending confirmation)", {
          transactionHash: txHash,
          from: account.address,
          to: options.to,
          amount: `${formatEther(amount)} GEN`,
        });
        return;
      }

      if (receipt.status === "reverted") {
        this.failSpinner("Transaction reverted");
        return;
      }

      const result = {
        transactionHash: txHash,
        from: account.address,
        to: options.to,
        amount: `${formatEther(amount)} GEN`,
        blockNumber: receipt.blockNumber.toString(),
        gasUsed: receipt.gasUsed.toString(),
      };

      this.succeedSpinner("Transfer successful!", result);
    } catch (error: any) {
      this.failSpinner("Transfer failed", error.message || error);
    }
  }
}
