import {
  getAddress,
  isAddress,
  recoverTransactionAddress,
  recoverMessageAddress,
  stringToBytes,
  serializeTransaction,
  serializeSignature,
  hexToBytes,
  type Address,
  type TransactionSerializable,
} from "viem";
import {toAccount} from "viem/accounts";
import {deviceResult, withLedger} from "./ledgerDevice";

export const DEFAULT_LEDGER_PATH = "44'/60'/0'/0/0";
export interface LedgerAccountData {
  type: "ledger";
  address: Address;
  derivationPath: string;
}

export function validateLedgerPath(path: string): void {
  if (
    !/^44'\/60'\/\d+'\/\d+\/\d+$/.test(path) ||
    path.split("/").some(part => Number(part.replace("'", "")) >= 0x80000000)
  ) {
    throw new Error(
      "Invalid Ledger derivation path. Expected an Ethereum path such as 44'/60'/0'/0/0 (without m/).",
    );
  }
}

export function validateLedgerAccount(data: LedgerAccountData): void {
  if (data.type !== "ledger" || !isAddress(data.address)) throw new Error("Invalid Ledger account address");
  validateLedgerPath(data.derivationPath);
}

export async function importLedgerAccount(derivationPath = DEFAULT_LEDGER_PATH): Promise<LedgerAccountData> {
  validateLedgerPath(derivationPath);
  return withLedger(async signer => {
    const {address} = await deviceResult(signer.getAddress(derivationPath, {checkOnDevice: true}));
    return {type: "ledger", address: getAddress(address), derivationPath};
  });
}

export function ledgerAccount(data: LedgerAccountData) {
  validateLedgerAccount(data);
  const verified = <T>(operation: Parameters<typeof withLedger<T>>[0]) =>
    withLedger(async signer => {
      const {address} = await deviceResult(signer.getAddress(data.derivationPath));
      if (address.toLowerCase() !== data.address.toLowerCase()) {
        throw new Error(
          "Connected Ledger does not match the imported account. Connect the correct device and passphrase.",
        );
      }
      return operation(signer);
    });
  return toAccount({
    address: getAddress(data.address),
    async signTransaction(transaction) {
      // GenLayer uses standard Ethereum envelopes. Reject unsupported types before device interaction.
      if (transaction.type && !["legacy", "eip2930", "eip1559"].includes(transaction.type)) {
        throw new Error(`Ledger transaction type not supported: ${transaction.type}`);
      }
      const tx = transaction as TransactionSerializable;
      const unsigned = serializeTransaction(tx);
      return verified(async signer => {
        console.error("Review and approve the transaction on your Ledger.");
        const signature = await deviceResult(
          signer.signTransaction(data.derivationPath, hexToBytes(unsigned)),
        );
        const v = signature.v;
        const yParity = (v < 2 ? v : v < 35 ? v - 27 : (v - 35) % 2) as 0 | 1;
        const serialized = serializeTransaction(tx, {
          r: signature.r,
          s: signature.s,
          v: BigInt(27 + yParity),
          yParity,
        });
        if (
          (await recoverTransactionAddress({serializedTransaction: serialized})).toLowerCase() !==
          data.address.toLowerCase()
        ) {
          throw new Error("Ledger signature does not match the imported account");
        }
        return serialized;
      });
    },
    async signMessage({message}) {
      return verified(async signer => {
        const payload =
          typeof message === "string"
            ? stringToBytes(message)
            : typeof message.raw === "string"
              ? hexToBytes(message.raw)
              : message.raw;
        const signature = await deviceResult(signer.signMessage(data.derivationPath, payload));
        const serialized = serializeSignature({...signature, v: BigInt(signature.v)});
        if (
          (await recoverMessageAddress({message, signature: serialized})).toLowerCase() !==
          data.address.toLowerCase()
        ) {
          throw new Error("Ledger message signature does not match the imported account");
        }
        return serialized;
      });
    },
    async signTypedData() {
      throw new Error("Ledger typed-data signing is not supported by the CLI");
    },
  });
}
