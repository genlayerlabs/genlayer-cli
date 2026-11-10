/**
 * Inline HTML+JS served by BrowserWalletBridge on 127.0.0.1. Kept as a single
 * template string (no static-asset build step; esbuild only bundles TS).
 *
 * Page-side flow:
 *   1. Read the session token from location.hash (#s=<token>) and send it on
 *      every API call via the X-Bridge-Token header.
 *   2. Discover wallets via EIP-6963 (announceProvider/requestProvider), let the
 *      user pick one, and route every provider call through that ACTIVE provider
 *      (falling back to window.ethereum when no wallet announces). Then
 *      eth_requestAccounts; POST /api/connected.
 *   3. wallet_switchEthereumChain (add chain on 4902), re-verify chainId.
 *   4. Long-poll GET /api/next; on {type:"tx"} eth_sendTransaction then POST
 *      /api/result; on {type:"done"|"abort"} show final panel and stop.
 *
 * No secrets are embedded; the token lives only in the URL fragment the CLI
 * printed/opened.
 */
export const BRIDGE_PAGE_HTML = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>GenLayer CLI — Wallet Bridge</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    margin: 0; padding: 2rem; line-height: 1.5;
    background: #0f1115; color: #e6e8ee;
    display: flex; justify-content: center;
  }
  .card {
    width: 100%; max-width: 520px; background: #171a21;
    border: 1px solid #262b36; border-radius: 14px; padding: 1.75rem;
  }
  h1 { font-size: 1.15rem; margin: 0 0 0.25rem; }
  .sub { color: #8b93a7; font-size: 0.85rem; margin: 0 0 1.25rem; }
  .status { font-size: 0.95rem; margin: 0.75rem 0; }
  .tx {
    background: #10131a; border: 1px solid #262b36; border-radius: 10px;
    padding: 0.9rem 1rem; margin: 1rem 0; font-size: 0.85rem;
  }
  .tx .label { font-weight: 600; margin-bottom: 0.4rem; }
  .tx .row { color: #8b93a7; word-break: break-all; font-family: ui-monospace, monospace; }
  button {
    appearance: none; border: none; border-radius: 10px; cursor: pointer;
    background: #4f7cff; color: white; font-size: 0.95rem; font-weight: 600;
    padding: 0.7rem 1.1rem; margin-top: 0.5rem;
  }
  button:disabled { opacity: 0.5; cursor: default; }
  /* EIP-6963 wallet picker: one button per announced wallet. Class beats the
     bare \`button\` rule on specificity, so these render as list rows. */
  .wallets { margin: 0.75rem 0; }
  .wallet {
    display: flex; align-items: center; gap: 0.6rem; width: 100%;
    background: #10131a; border: 1px solid #262b36; color: #e6e8ee;
    border-radius: 10px; padding: 0.6rem 0.85rem; margin: 0.4rem 0;
    font-size: 0.9rem; font-weight: 600; text-align: left;
  }
  .wallet:hover { border-color: #4f7cff; }
  .wallet img { width: 22px; height: 22px; border-radius: 5px; flex: 0 0 auto; }
  .ok { color: #4ade80; } .warn { color: #fbbf24; } .err { color: #f87171; }
  code { background: #10131a; padding: 0.1rem 0.35rem; border-radius: 5px; }
  a { color: #7ea1ff; }
</style>
</head>
<body>
  <div class="card">
    <h1>GenLayer CLI — Wallet Bridge</h1>
    <p class="sub">This page connects your browser wallet to the GenLayer CLI running on this machine. It only talks to <code>127.0.0.1</code>.</p>
    <div id="status" class="status">Initializing…</div>
    <div id="wallets" class="wallets"></div>
    <div id="tx"></div>
    <button id="action" style="display:none"></button>
  </div>
<script>
(function () {
  var TOKEN = (new URLSearchParams(location.hash.slice(1))).get("s") || "";
  if (TOKEN) history.replaceState(null, "", location.pathname);
  var statusEl = document.getElementById("status");
  var walletsEl = document.getElementById("wallets");
  var txEl = document.getElementById("tx");
  var actionBtn = document.getElementById("action");
  var connectedAddress = null;
  var chain = null;
  var stopped = false;

  // EIP-6963 provider discovery. \`providers\` collects each announced wallet
  // ({info:{name,icon,rdns,uuid}, provider}); \`activeProvider\` is the one the
  // user selected (or the legacy window.ethereum fallback). Every provider call
  // below goes through activeProvider, never window.ethereum directly.
  var providers = [];
  var activeProvider = null;
  var discoveryDone = false;

  function setStatus(msg, cls) {
    statusEl.textContent = msg;
    statusEl.className = "status" + (cls ? " " + cls : "");
  }
  function showButton(text, handler) {
    actionBtn.style.display = "";
    actionBtn.textContent = text;
    actionBtn.disabled = false;
    actionBtn.onclick = handler;
  }
  function hideButton() { actionBtn.style.display = "none"; actionBtn.onclick = null; }
  function clearWalletList() { walletsEl.innerHTML = ""; walletsEl.style.display = "none"; }

  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({}, opts.headers, {
      "X-Bridge-Token": TOKEN,
      "Content-Type": "application/json",
    });
    opts.cache = "no-store";
    return fetch(path, opts);
  }

  async function postConnectedAddress() {
    await api("/api/connected", {method: "POST", body: JSON.stringify({address: connectedAddress})});
  }

  function toHexQuantity(v) {
    if (v === undefined || v === null) return undefined;
    if (typeof v === "string" && v.indexOf("0x") === 0) return v;
    return "0x" + BigInt(v).toString(16);
  }

  // ---- EIP-6963 discovery + wallet selection --------------------------------

  function addProvider(detail) {
    if (!detail || !detail.provider || !detail.info) return;
    var rdns = detail.info.rdns;
    for (var i = 0; i < providers.length; i++) {
      // De-dupe by rdns (a wallet may re-announce on each requestProvider).
      if (providers[i].info.rdns === rdns) { providers[i] = detail; return; }
    }
    providers.push(detail);
  }

  function renderWalletList() {
    walletsEl.innerHTML = "";
    walletsEl.style.display = providers.length ? "" : "none";
    providers.forEach(function (d) {
      var b = document.createElement("button");
      b.className = "wallet";
      b.type = "button";
      if (d.info.icon) {
        var img = document.createElement("img");
        img.src = d.info.icon;
        img.alt = "";
        b.appendChild(img);
      }
      var span = document.createElement("span");
      span.textContent = d.info.name || d.info.rdns || "Wallet";
      b.appendChild(span);
      b.onclick = function () { selectProvider(d); };
      walletsEl.appendChild(b);
    });
  }

  function selectProvider(detail) {
    activeProvider = detail.provider;
    clearWalletList();
    showButton("Connect wallet (" + (detail.info.name || "selected") + ")", connect);
    setStatus("Ready. Click “Connect wallet” to sign with " + chain.chainName + ".");
  }

  function useLegacyProvider() {
    activeProvider = window.ethereum;
    clearWalletList();
    showButton("Connect wallet", connect);
    setStatus("Ready. Click “Connect wallet” to sign with " + chain.chainName + ".");
  }

  // Decide what to show given the wallets discovered so far. Called once the
  // discovery grace window closes, and again on any late announcement (as long
  // as nothing is selected yet), so a slow wallet still shows up.
  function chooseProvider() {
    if (activeProvider) return;
    if (!discoveryDone) { setStatus("Detecting wallets…"); return; }
    if (providers.length === 1) {
      selectProvider(providers[0]); // single wallet: auto-select, no picker friction
    } else if (providers.length >= 2) {
      hideButton();
      setStatus("Select a wallet to connect:");
      renderWalletList();
    } else if (window.ethereum) {
      useLegacyProvider(); // no EIP-6963 wallet announced; fall back to the injected global
    } else {
      setStatus("No browser wallet detected. Install MetaMask (or another injected wallet), then reload this page.", "err");
    }
  }

  function discoverProviders() {
    window.addEventListener("eip6963:announceProvider", function (e) {
      addProvider(e.detail);
      if (discoveryDone && !activeProvider) chooseProvider();
    });
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    setStatus("Detecting wallets…");
    // Announcements are near-instant, but give slow extensions a short grace
    // before committing to auto-select / legacy fallback.
    setTimeout(function () { discoveryDone = true; chooseProvider(); }, 300);
  }

  // ---------------------------------------------------------------------------

  async function ensureChain() {
    var current = await activeProvider.request({method: "eth_chainId"});
    if (current && current.toLowerCase() === chain.chainIdHex.toLowerCase()) return;
    try {
      await activeProvider.request({
        method: "wallet_switchEthereumChain",
        params: [{chainId: chain.chainIdHex}],
      });
    } catch (err) {
      if (err && err.code === 4902) {
        await activeProvider.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: chain.chainIdHex,
            chainName: chain.chainName,
            rpcUrls: chain.rpcUrls,
            nativeCurrency: chain.nativeCurrency,
            blockExplorerUrls: chain.blockExplorerUrls || [],
          }],
        });
        await activeProvider.request({
          method: "wallet_switchEthereumChain",
          params: [{chainId: chain.chainIdHex}],
        });
      } else {
        throw err;
      }
    }
    var after = await activeProvider.request({method: "eth_chainId"});
    if (!after || after.toLowerCase() !== chain.chainIdHex.toLowerCase()) {
      throw new Error("Wallet is on the wrong network. Please switch to " + chain.chainName + ".");
    }
  }

  async function connect() {
    if (!activeProvider) {
      setStatus("No wallet selected. Reload and pick a wallet.", "err");
      return;
    }
    hideButton();
    setStatus("Requesting wallet connection…");
    var accounts = await activeProvider.request({method: "eth_requestAccounts"});
    connectedAddress = accounts[0];

    setStatus("Checking network…");
    await ensureChain();

    await postConnectedAddress();
    setStatus("Connected as " + connectedAddress + ". Waiting for the CLI…", "ok");

    if (activeProvider.on) {
      activeProvider.on("accountsChanged", function (accts) {
        void (async function () {
          var nextAddress = accts && accts[0];
          if (!nextAddress) {
            stopped = true;
            connectedAddress = null;
            setStatus("Wallet account disconnected. Reconnect with the CLI to continue.", "err");
            return;
          }
          connectedAddress = nextAddress;
          try {
            await postConnectedAddress();
            setStatus(
              "Account changed to " + connectedAddress + ". The CLI will only accept results from this account.",
              "warn",
            );
          } catch (err) {
            stopped = true;
            setStatus("Account changed, but the CLI bridge could not update the signer. Reconnect the wallet session.", "err");
          }
        })();
      });
      // Chain is re-verified before every tx (ensureChain), but surface an
      // explicit hint if the wallet moves off the target network mid-session.
      activeProvider.on("chainChanged", function (chainIdHex) {
        if (stopped || !chain) return;
        if (typeof chainIdHex === "string" && chainIdHex.toLowerCase() === chain.chainIdHex.toLowerCase()) return;
        setStatus("Wallet switched to a different network. The CLI needs " + chain.chainName + "; it will prompt you to switch back on the next transaction.", "warn");
      });
    }

    pollNext();
  }

  async function pollNext() {
    if (stopped) return;
    try {
      var res = await api("/api/next", {method: "GET"});
      var msg = await res.json();
      if (msg.type === "none") { return pollNext(); }
      if (msg.type === "done") {
        stopped = true; hideButton(); txEl.innerHTML = "";
        setStatus(msg.message || "All done. You can close this tab.", "ok");
        return;
      }
      if (msg.type === "abort") {
        stopped = true; hideButton(); txEl.innerHTML = "";
        setStatus(msg.message || "The CLI aborted the request.", "err");
        return;
      }
      if (msg.type === "tx") {
        await handleTx(msg.tx);
        return pollNext();
      }
      return pollNext();
    } catch (e) {
      if (stopped) return;
      // Server may have shut down (CLI finished / Ctrl-C). Stop quietly.
      setStatus("Connection to the CLI closed.", "warn");
    }
  }

  function renderTx(tx) {
    txEl.innerHTML =
      '<div class="tx"><div class="label">' + escapeHtml(tx.label || "Transaction") + '</div>' +
      '<div class="row">To: ' + escapeHtml(tx.to) + '</div>' +
      (tx.value ? '<div class="row">Value: ' + escapeHtml(tx.value) + ' (wei, hex)</div>' : '') +
      '</div>';
  }

  async function handleTx(tx) {
    renderTx(tx);
    setStatus("Confirm the transaction in your wallet…");
    try {
      await ensureChain();
      var params = {
        from: connectedAddress,
        to: tx.to,
        data: tx.data,
      };
      if (tx.value) params.value = toHexQuantity(tx.value);
      if (tx.gasPrice) params.gasPrice = toHexQuantity(tx.gasPrice);
      if (tx.gas) params.gas = toHexQuantity(tx.gas);
      if (tx.type) params.type = tx.type; // "0x0" for the SDK's legacy IC txs
      // Deliberately DROP tx.nonce and tx.chainId: MetaMask manages its own
      // pending nonce and enforces the chain (ensureChain above), and some
      // wallet versions reject unknown/mismatched nonce/chainId keys.
      var txHash = await activeProvider.request({
        method: "eth_sendTransaction",
        params: [params],
      });
      await api("/api/result", {
        method: "POST",
        body: JSON.stringify({id: tx.id, status: "sent", txHash: txHash, from: connectedAddress}),
      });
      setStatus("Transaction submitted: " + txHash + ". Waiting for the CLI…", "ok");
    } catch (err) {
      var status = (err && err.code === 4001) ? "rejected" : "error";
      var message = (err && (err.message || err.reason)) || String(err);
      await api("/api/result", {
        method: "POST",
        body: JSON.stringify({id: tx.id, status: status, message: message, from: connectedAddress}),
      });
      if (status === "rejected") {
        setStatus("You rejected the transaction. Returning to the CLI.", "warn");
      } else {
        setStatus("Transaction failed: " + message, "err");
      }
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
    });
  }

  async function init() {
    if (!TOKEN) { setStatus("Missing session token. Reopen the URL printed by the CLI.", "err"); return; }
    try {
      var res = await api("/api/session", {method: "GET"});
      if (!res.ok) { setStatus("Session not authorized.", "err"); return; }
      var data = await res.json();
      chain = data.chain;
      // Discover wallets (EIP-6963) and let the user pick; chooseProvider then
      // shows the Connect button (or the picker, or the no-wallet message).
      discoverProviders();
    } catch (e) {
      setStatus("Could not reach the CLI bridge. It may have already closed.", "err");
    }
  }

  init();
})();
</script>
</body>
</html>`;
