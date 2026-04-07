import {BaseAction, BUILT_IN_NETWORKS, resolveNetwork} from "../../lib/actions/BaseAction";
import {parseEther, formatEther} from "viem";
import {createClient, createAccount} from "genlayer-js";
import type {GenLayerChain, Address, Hash} from "genlayer-js/types";
import {readFileSync, existsSync} from "fs";
import {ethers} from "ethers";

export interface FundAccountOptions {
  to: string;
  amount?: string;
  rpc?: string;
  network?: string;
  password?: string;
}

export class FundAccountAction extends BaseAction {
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

  private parseAmount(amount?: string): bigint {
    // Default to 100 GEN if no amount specified
    const amountToParse = amount || "100";
    
    // Support "10gen" or "10" (assumes gen) or wei values
    const lowerAmount = amountToParse.toLowerCase();
    if (lowerAmount.endsWith("gen")) {
      const value = lowerAmount.slice(0, -3);
      return parseEther(value);
    }
    // If it's a large number (likely wei), use as-is
    if (BigInt(amountToParse) > 1_000_000_000_000n) {
      return BigInt(amountToParse);
    }
    // Otherwise assume it's in GEN
    return parseEther(amountToParse);
  }

  async execute(options: FundAccountOptions): Promise<void> {
    this.startSpinner("Funding account...");

    try {
      // Use the default account as the faucet source
      const faucetAccountName = "default";
      const keystorePath = this.getKeystorePath(faucetAccountName);

      if (!existsSync(keystorePath)) {
        this.failSpinner(`Faucet account '${faucetAccountName}' not found. Please create the default account first.`);
        return;
      }

      const keystoreJson = readFileSync(keystorePath, "utf-8");
      const keystoreData = JSON.parse(keystoreJson);

      if (!this.isValidKeystoreFormat(keystoreData)) {
        this.failSpinner("Invalid keystore format for faucet account.");
        return;
      }

      // Get private key for faucet account
      const cachedKey = await this.keychainManager.getPrivateKey(faucetAccountName);
      let privateKey: string;

      if (cachedKey) {
        privateKey = cachedKey;
      } else {
        let password: string;
        if (options.password) {
          password = options.password;
        } else {
          this.stopSpinner();
          password = await this.promptPassword(`Enter password to unlock faucet account '${faucetAccountName}':`);
          this.startSpinner("Funding account...");
        }
        const wallet = await ethers.Wallet.fromEncryptedJson(keystoreJson, password);
        privateKey = wallet.privateKey;
      }

      const network = this.getNetwork(options.network);
      const faucetAccount = createAccount(privateKey as Hash);
      const amount = this.parseAmount(options.amount);

      const client = createClient({
        chain: network,
        account: faucetAccount,
        endpoint: options.rpc,
      });

      this.setSpinnerText(`Sending ${formatEther(amount)} GEN from faucet to ${options.to}...`);

      // Get nonce
      const nonce = await client.getCurrentNonce({address: faucetAccount.address});

      // Prepare and sign transaction
      const transactionRequest = await client.prepareTransactionRequest({
        account: faucetAccount,
        to: options.to as Address,
        value: amount,
        type: "legacy",
        nonce: Number(nonce),
      });

      const serializedTransaction = await faucetAccount.signTransaction(transactionRequest);
      const txHash = await client.sendRawTransaction({serializedTransaction});

      this.setSpinnerText(`Transaction submitted: ${txHash}\nWaiting for confirmation...`);

      // Poll for receipt
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
        this.succeedSpinner("Account funded (pending confirmation)", {
          transactionHash: txHash,
          from: faucetAccount.address,
          to: options.to,
          amount: `${formatEther(amount)} GEN`,
        });
        return;
      }

      if (receipt.status === "reverted") {
        this.failSpinner("Funding transaction reverted");
        return;
      }

      const result = {
        transactionHash: txHash,
        from: faucetAccount.address,
        to: options.to,
        amount: `${formatEther(amount)} GEN`,
        blockNumber: receipt.blockNumber.toString(),
        gasUsed: receipt.gasUsed.toString(),
      };

      this.succeedSpinner("Account funded successfully!", result);
    } catch (error: any) {
      this.failSpinner("Funding failed", error.message || error);
    }
  }
}
