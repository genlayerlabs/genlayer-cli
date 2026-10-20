import {test} from "@playwright/test";

/**
 * S3 — Lane B: intelligent-contract deploy/write over the browser session.
 *
 * DEFERRED (nightly / Docker follow-up per design §3, §6). IC deploy goes
 * through genlayer-js against ConsensusMain, which only exists on the Docker
 * `localnet` studio node (id 61127, RPC :4000/api) — a bare anvil has no
 * GenVM/consensus, so this lane cannot run on the per-PR anvil harness.
 *
 * When implemented, this describe block boots `genlayer localnet up`, connects
 * the session against localnet, deploys a trivial `.py` IC fixture through the
 * session's eip1193Provider, and asserts the returned contract address + a
 * read-back. It is guarded behind GENLAYER_E2E_LOCALNET so it never runs (and
 * never fails) on the standard anvil CI job.
 */
const LOCALNET_ENABLED = process.env.GENLAYER_E2E_LOCALNET === "1";

test.describe.skip("S3 Lane B IC deploy on Docker localnet (nightly)", () => {
  test("deploy .py IC over the browser session", async () => {
    // Intentionally unimplemented; see file header. Enable with
    // GENLAYER_E2E_LOCALNET=1 and a running Docker localnet.
    void LOCALNET_ENABLED;
  });
});
