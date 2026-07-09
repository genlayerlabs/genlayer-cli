/**
 * Injected `window.ethereum` for the Tier-2 browser-signing e2e lanes.
 *
 * `installMockProvider` returns a self-invoking script string that Playwright
 * installs via `page.addInitScript(...)` BEFORE `bridgePage.ts` runs, so the
 * mock always wins the injection race (design §4/§9). The mock is a thin
 * EIP-1193 shim: account/chain queries are answered locally, and the one
 * privileged operation — `eth_sendTransaction` — is delegated to Node via
 * `window.__glSign` (wired in helpers/bridgePage.ts), where a real viem local
 * account signs and broadcasts to a real anvil and returns a real tx hash.
 *
 * No key or RPC ever lives in page JS. `behavior` gives deterministic error
 * lanes without any human/extension:
 *   - "approve"       — sign+broadcast for real (happy path)
 *   - "reject"        — throw 4001 (user rejected) on eth_sendTransaction
 *   - "wrong-network" — throw 4901 on wallet_switchEthereumChain
 */
export interface MockProviderOptions {
  address: `0x${string}`;
  /** Must match GenLayerChain.id targeted by the bridge's ensureChain(). */
  chainIdHex: string;
  behavior?: "approve" | "reject" | "wrong-network";
}

export const installMockProvider = (opts: MockProviderOptions): string => {
  const behavior = opts.behavior ?? "approve";
  return `
  (() => {
    let currentChain = ${JSON.stringify(opts.chainIdHex)};
    const ADDR = ${JSON.stringify(opts.address)};
    window.ethereum = {
      isMetaMask: true,
      _l: {},
      on(ev, cb) { (this._l[ev] = this._l[ev] || []).push(cb); },
      removeListener() {},
      async request({ method, params }) {
        switch (method) {
          case "eth_requestAccounts":
          case "eth_accounts":
            return [ADDR];
          case "eth_chainId":
            return currentChain;
          case "wallet_switchEthereumChain":
            ${
              behavior === "wrong-network"
                ? 'throw { code: 4901, message: "Wallet is disconnected from the requested chain." };'
                : "currentChain = params[0].chainId; return null;"
            }
          case "wallet_addEthereumChain":
            return null;
          case "eth_sendTransaction":
            ${
              behavior === "reject"
                ? 'throw { code: 4001, message: "User rejected the request." };'
                : "return await window.__glSign(params[0]);"
            }
          default:
            throw { code: 4200, message: "unsupported " + method };
        }
      },
    };
  })();
  `;
};
