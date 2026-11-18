// @vitest-environment node
import {beforeEach, describe, expect, it, vi} from "vitest";
import {Wallet, Transaction, Signature} from "ethers";
import {recoverTransactionAddress, recoverMessageAddress, type TransactionSerializable} from "viem";
import {of, throwError, NEVER} from "rxjs";
import {deviceResult} from "../../src/lib/accounts/ledgerDevice";
import {
  ledgerAccount,
  importLedgerAccount,
  validateLedgerPath,
  DEFAULT_LEDGER_PATH,
} from "../../src/lib/accounts/ledger";

const mocks = vi.hoisted(() => ({
  getAddress: vi.fn(),
  signTransaction: vi.fn(),
  signMessage: vi.fn(),
  withLedger: vi.fn(),
}));
vi.mock("../../src/lib/accounts/ledgerDevice", async importOriginal => ({
  ...(await importOriginal<object>()),
  withLedger: mocks.withLedger,
}));
// Fixed, public test key; never used on a network.
const wallet = new Wallet(`0x${"11".repeat(32)}`);
const data = {
  type: "ledger" as const,
  address: wallet.address as `0x${string}`,
  derivationPath: DEFAULT_LEDGER_PATH,
};
const action = (output: unknown) => ({observable: of({status: "completed", output}), cancel: vi.fn()});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withLedger.mockImplementation(fn => fn(mocks));
  mocks.getAddress.mockReturnValue(action({address: wallet.address}));
  mocks.signTransaction.mockImplementation((_path, bytes) => {
    const tx = Transaction.from(`0x${Buffer.from(bytes).toString("hex")}`);
    const sig = wallet.signingKey.sign(tx.unsignedHash);
    return action({
      r: sig.r,
      s: sig.s,
      v: tx.type === 0 ? Number(tx.chainId * 2n + 35n) + sig.yParity : sig.yParity,
    });
  });
});

describe("Ledger account", () => {
  it("imports only public metadata and verifies the address on-device", async () => {
    expect(await importLedgerAccount()).toEqual(data);
    expect(mocks.getAddress).toHaveBeenCalledWith(DEFAULT_LEDGER_PATH, {checkOnDevice: true});
  });
  it.each(["m/44'/60'/0'/0/0", "44'/0'/0'/0/0", "44'/60'/2147483648'/0/0", "", "../key"])(
    "rejects invalid path %s",
    path => {
      expect(() => validateLedgerPath(path)).toThrow("Invalid Ledger derivation path");
    },
  );
  it("rejects malformed account metadata", () => {
    expect(() => ledgerAccount({...data, address: "0x123"})).toThrow("Invalid Ledger account address");
  });
  it.each(["legacy", "eip2930", "eip1559"] as const)("signs and recovers a %s transaction", async type => {
    const tx = {
      type,
      chainId: 4221,
      nonce: 3,
      gas: 70000n,
      to: data.address,
      value: 100n,
      data: "0x1234" as const,
      ...(type === "eip1559" ? {maxFeePerGas: 100n, maxPriorityFeePerGas: 1n} : {gasPrice: 10n}),
    };
    const signed = await ledgerAccount(data).signTransaction(tx as TransactionSerializable);
    expect(await recoverTransactionAddress({serializedTransaction: signed})).toBe(data.address);
    const decoded = Transaction.from(signed);
    expect(decoded.chainId).toBe(4221n);
    expect(decoded.data).toBe("0x1234");
    expect(decoded.nonce).toBe(3);
    expect(decoded.value).toBe(100n);
  });
  it("rejects a different device before requesting a signature", async () => {
    mocks.getAddress.mockReturnValue(action({address: `0x${"22".repeat(20)}`}));
    await expect(ledgerAccount(data).signTransaction({chainId: 1, gasPrice: 1n})).rejects.toThrow(
      "does not match",
    );
    expect(mocks.signTransaction).not.toHaveBeenCalled();
  });
  it("propagates user rejection without producing a transaction", async () => {
    mocks.signTransaction.mockReturnValue({
      observable: of({status: "error", error: new Error("User rejected")}),
      cancel: vi.fn(),
    });
    await expect(ledgerAccount(data).signTransaction({chainId: 1, gasPrice: 1n})).rejects.toThrow(
      "User rejected",
    );
  });
  it("rejects an invalid signature", async () => {
    const sig = new Wallet(`0x${"22".repeat(32)}`).signingKey.sign(`0x${"00".repeat(32)}`);
    mocks.signTransaction.mockReturnValue(action({r: sig.r, s: sig.s, v: sig.v}));
    await expect(ledgerAccount(data).signTransaction({chainId: 1, gasPrice: 1n})).rejects.toThrow(
      "signature does not match",
    );
  });
  it("signs raw personal messages used by the SDK", async () => {
    const message = {raw: "0x1234" as const};
    const signature = Signature.from(await wallet.signMessage(new Uint8Array([0x12, 0x34])));
    mocks.signMessage.mockReturnValue(action({r: signature.r, s: signature.s, v: signature.v}));
    const signed = await ledgerAccount(data).signMessage({message});
    expect(await recoverMessageAddress({message, signature: signed})).toBe(data.address);
  });
});

describe("device result lifecycle", () => {
  it.each(["error", "stopped"])("cancels subscription on %s", async status => {
    const request = {observable: of({status}), cancel: vi.fn()};
    await expect(deviceResult(request)).rejects.toThrow();
    expect(request.cancel).toHaveBeenCalledOnce();
  });
  it("cleans up when the observable errors", async () => {
    const request = {observable: throwError(() => new Error("Disconnected")), cancel: vi.fn()};
    await expect(deviceResult(request)).rejects.toThrow("Disconnected");
    expect(request.cancel).toHaveBeenCalledOnce();
  });
  it("cancels an unresponsive device after two minutes", async () => {
    vi.useFakeTimers();
    try {
      const request = {observable: NEVER, cancel: vi.fn()};
      const result = expect(deviceResult(request)).rejects.toThrow();
      await vi.waitFor(() => expect(vi.getTimerCount()).toBeGreaterThan(0));
      await vi.advanceTimersByTimeAsync(120_001);
      await result;
      expect(request.cancel).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
