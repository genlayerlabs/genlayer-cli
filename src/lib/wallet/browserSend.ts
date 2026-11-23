import {
  createPublicClient,
  http,
  hexToBigInt,
  type PublicClient,
  type Chain,
  type HttpTransportConfig,
  type TransactionReceipt,
} from "viem";
import type {GenLayerChain, Address, Hash} from "genlayer-js/types";
import {BrowserWalletBridge, type BridgeChainParams, type BridgeTxRequest} from "./browserBridge";
import type {WalletSessionClient} from "./sessionClient";

// GenLayer RPC rejects JSON-RPC requests with id=0 (treats 0 as missing).
// Viem starts its id counter at 0, so we ensure non-zero ids. Owned here now
// (was StakingAction.ts) and re-exported for back-compat.
export const glHttpConfig: HttpTransportConfig = {
  async fetchFn(url, init) {
    if (init?.body) {
      const body = JSON.parse(init.body as string);
      if (body.id === 0) body.id = 1;
      init = {...init, body: JSON.stringify(body)};
    }
    return fetch(url, init);
  },
};

export type WalletMode = "keystore" | "browser";

export interface BrowserSessionParams {
  /** Already-resolved chain (via resolveNetwork / getNetwork). */
  chain: GenLayerChain;
  /** config.rpc || chain.rpcUrls.default.http[0]. */
  rpcUrl: string;
  log?: (msg: string) => void;
  logInfo?: (msg: string) => void;
  /** Injectable for tests (default: the bridge's own openUrl). */
  openUrl?: (url: string) => Promise<unknown>;
  /** Register a SIGINT handler (default: true; tests pass false). */
  handleSigint?: boolean;
}

/** EIP-1193-compatible request shape the genlayer-js client provider expects. */
export interface Eip1193Provider {
  request(args: {method: string; params?: any[]}): Promise<any>;
}

export interface BridgeSendResult {
  txHash: Hash;
  from?: Address;
}

/**
 * Transport seam between "how a tx gets to the wallet" and everything above it
 * (preflight, receipt wait, EIP-1193 shim, labels). A local transport owns a
 * bridge in-process; a remote transport enqueues to a running daemon over HTTP.
 */
export interface BridgeTransport {
  readonly kind: "local" | "remote";
  readonly signerAddress: Address;
  sendTransaction(tx: Omit<BridgeTxRequest, "id">): Promise<BridgeSendResult>;
  /** Local: close the bridge. Remote: no-op (detach only — never kill a shared session). */
  close(finalMessage?: string): Promise<void>;
}

export interface BrowserSession {
  /** Present only for local (own-bridge) sessions; absent for remote daemon sessions. */
  bridge?: BrowserWalletBridge;
  kind: "local" | "remote";
  sessionUrl: string;
  publicClient: PublicClient;
  chain: GenLayerChain;
  signerAddress: Address;
  /**
   * Lane A: preflight (publicClient.call) + queue to the wallet + await the EVM
   * receipt; throws on predicted or on-chain revert.
   */
  sendTransaction(tx: {
    to: Address;
    data: `0x${string}`;
    value?: bigint;
    gas?: bigint;
    label: string;
  }): Promise<TransactionReceipt>;
  /**
   * Lane B: EIP-1193 shim for genlayer-js `createClient({account, provider})`.
   * Forwards eth_sendTransaction to the bridge; answers eth_chainId/eth_accounts
   * locally. Does NOT wait for the receipt (the SDK does that against the RPC).
   */
  eip1193Provider: Eip1193Provider;
  /** Label shown on the bridge page for the NEXT provider-originated tx. */
  setNextLabel(label: string): void;
  close(finalMessage?: string): Promise<void>;
}

/** Build the bridge/add-chain params from a resolved GenLayer chain. */
export function buildBridgeChain(chain: GenLayerChain, rpcUrl: string): BridgeChainParams {
  return {
    chainId: chain.id,
    chainName: chain.name,
    rpcUrls: [rpcUrl],
    nativeCurrency: chain.nativeCurrency
      ? {
          name: chain.nativeCurrency.name,
          symbol: chain.nativeCurrency.symbol,
          decimals: chain.nativeCurrency.decimals,
        }
      : {name: "GEN Token", symbol: "GEN", decimals: 18},
    blockExplorerUrls: chain.blockExplorers?.default?.url ? [chain.blockExplorers.default.url] : undefined,
  };
}

function sameAddress(a: Address, b: Address): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function assertResultSigner(result: BridgeSendResult, signerAddress: Address): Hash {
  if (result.from && !sameAddress(result.from, signerAddress)) {
    throw new Error(
      `Wallet returned a transaction from ${result.from}, but the expected signer is ${signerAddress}. ` +
        "Switch back to the expected account or reconnect the wallet session.",
    );
  }
  return result.txHash;
}

/**
 * Build the shared signing lanes (preflight + receipt wait Lane A, EIP-1193
 * shim Lane B, labels) on top of a transport. This body is identical for local
 * and remote sessions — only the transport differs.
 */
export function buildBrowserSession(
  transport: BridgeTransport,
  chain: GenLayerChain,
  rpcUrl: string,
  bridgeChain: BridgeChainParams,
  kind: "local" | "remote",
  sessionUrl: string,
  bridge?: BrowserWalletBridge,
): BrowserSession {
  const publicClient = createPublicClient({
    chain: chain as unknown as Chain,
    transport: http(rpcUrl, glHttpConfig),
  });

  const signerAddress = transport.signerAddress;
  const chainIdHex = `0x${chain.id.toString(16)}`;
  let nextLabel: string | undefined;

  const sendTransaction = async (tx: {
    to: Address;
    data: `0x${string}`;
    value?: bigint;
    gas?: bigint;
    label: string;
  }): Promise<TransactionReceipt> => {
    // Preflight to surface reverts before the wallet ever prompts.
    try {
      await publicClient.call({
        account: signerAddress,
        to: tx.to,
        data: tx.data,
        value: tx.value,
      });
    } catch (error: any) {
      // Remote transport.close() is a no-op: one failed preflight must NOT kill
      // a shared daemon session. Local closes its own single-use bridge.
      await transport.close("The CLI aborted: the transaction would revert.");
      throw new Error(
        `Transaction would revert (preflight): ${error.shortMessage || error.message || error}`,
      );
    }

    const result = await transport.sendTransaction({
      to: tx.to,
      data: tx.data,
      value: tx.value,
      gas: tx.gas,
      label: tx.label,
    });
    const hash = assertResultSigner(result, signerAddress);

    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      timeout: 300_000,
    });

    if (receipt.status === "reverted") {
      const explorer = bridgeChain.blockExplorerUrls?.[0];
      const hint = explorer ? ` See ${explorer.replace(/\/$/, "")}/tx/${hash}` : "";
      throw new Error(`Transaction ${hash} reverted.${hint}`);
    }

    return receipt;
  };

  const eip1193Provider: Eip1193Provider = {
    async request({method, params = []}: {method: string; params?: any[]}) {
      switch (method) {
        case "eth_chainId":
          // Satisfies the SDK's assertChainMatch; real chain enforcement is
          // page-side (wallet_switchEthereumChain, re-verified before each send).
          return chainIdHex;
        case "eth_accounts":
        case "eth_requestAccounts":
          return [signerAddress];
        case "eth_sendTransaction": {
          const req = (params[0] ?? {}) as {
            to?: Address;
            data?: `0x${string}`;
            value?: string;
            gas?: string;
            gasPrice?: string;
            nonce?: string;
            type?: string;
          };
          const result = await transport.sendTransaction({
            to: req.to as Address,
            data: (req.data ?? "0x") as `0x${string}`,
            value: req.value !== undefined ? hexToBigInt(req.value as `0x${string}`) : undefined,
            gas: req.gas !== undefined ? hexToBigInt(req.gas as `0x${string}`) : undefined,
            gasPrice: req.gasPrice !== undefined ? hexToBigInt(req.gasPrice as `0x${string}`) : undefined,
            nonce: req.nonce !== undefined ? Number(hexToBigInt(req.nonce as `0x${string}`)) : undefined,
            type: req.type,
            label: nextLabel ?? "GenLayer transaction",
          });
          const hash = assertResultSigner(result, signerAddress);
          nextLabel = undefined;
          return hash;
        }
        default:
          throw new Error(`Method ${method} is not supported by the browser-wallet bridge`);
      }
    },
  };

  const setNextLabel = (label: string): void => {
    nextLabel = label;
  };

  return {
    bridge,
    kind,
    sessionUrl,
    publicClient,
    chain,
    signerAddress,
    sendTransaction,
    eip1193Provider,
    setNextLabel,
    close: (finalMessage?: string) => transport.close(finalMessage),
  };
}

/** Transport that owns an in-process BrowserWalletBridge (per-command / wizard). */
class LocalBridgeTransport implements BridgeTransport {
  readonly kind = "local" as const;
  constructor(
    private readonly bridge: BrowserWalletBridge,
    readonly signerAddress: Address,
  ) {}
  async sendTransaction(tx: Omit<BridgeTxRequest, "id">): Promise<BridgeSendResult> {
    return {txHash: await this.bridge.sendTransaction(tx)};
  }
  close(finalMessage?: string): Promise<void> {
    return this.bridge.close(finalMessage);
  }
}

/** Transport that enqueues to a running daemon over HTTP; close() detaches only. */
class RemoteSessionTransport implements BridgeTransport {
  readonly kind = "remote" as const;
  constructor(
    private readonly client: WalletSessionClient,
    readonly signerAddress: Address,
  ) {}
  async sendTransaction(tx: Omit<BridgeTxRequest, "id">): Promise<BridgeSendResult> {
    const id = await this.client.enqueueTx(tx);
    return this.client.waitForTxResult(id);
  }
  async close(): Promise<void> {
    // No-op: the daemon session is shared and outlives this command.
  }
}

/**
 * Open a browser-wallet signing session with an in-process bridge: start the
 * localhost bridge, open the wallet page, wait for connect, and return both
 * signing lanes. Never touches keystore/keychain/password code paths.
 * Action-agnostic (reused by the wizard and the resolver's own-bridge fallback).
 */
export async function openBrowserWalletSession(params: BrowserSessionParams): Promise<BrowserSession> {
  const {chain, rpcUrl} = params;
  const log = params.log ?? (() => {});
  const logInfo = params.logInfo ?? (() => {});

  const bridgeChain = buildBridgeChain(chain, rpcUrl);

  const bridge = new BrowserWalletBridge({
    chain: bridgeChain,
    openUrl: params.openUrl,
    handleSigint: params.handleSigint,
    log,
  });

  const {url} = await bridge.start();
  logInfo(`Open this URL in a browser with your wallet to sign:\n  ${url}`);
  logInfo(
    "(Remote/SSH? Forward the port first: ssh -L <port>:127.0.0.1:<port> ...; " +
      "do not use -g, GatewayPorts yes, or bind the local side to a public interface.)",
  );

  const signerAddress = await bridge.waitForConnection();
  const transport = new LocalBridgeTransport(bridge, signerAddress);
  return buildBrowserSession(transport, chain, rpcUrl, bridgeChain, "local", url, bridge);
}

/**
 * Build a session backed by a running daemon (discovered via the descriptor).
 * Asserts the wallet is already connected, then wraps a remote transport whose
 * close() is a no-op so per-command finally blocks never tear the session down.
 */
export async function openRemoteWalletSession(params: {
  client: WalletSessionClient;
  chain: GenLayerChain;
  rpcUrl: string;
  log?: (msg: string) => void;
  logInfo?: (msg: string) => void;
}): Promise<BrowserSession> {
  const {client, chain, rpcUrl} = params;
  const state = await client.state();
  if (!state.connected || !state.address) {
    throw new Error(
      "The wallet session is not connected. Run 'genlayer wallet connect' and approve in your browser.",
    );
  }
  const bridgeChain = buildBridgeChain(chain, rpcUrl);
  const transport = new RemoteSessionTransport(client, state.address);
  return buildBrowserSession(transport, chain, rpcUrl, bridgeChain, "remote", state.url);
}
