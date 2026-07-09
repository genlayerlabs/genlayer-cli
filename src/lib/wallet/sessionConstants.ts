/**
 * Single source of truth for the persistent wallet-session timing constants.
 * Shared by the daemon, the session client, and the bridge page so the
 * heartbeat / liveness budgets never drift between producer and consumer.
 */

/** Page long-poll window (existing bridge behaviour). */
export const LONG_POLL_MS = 25_000;

/**
 * Client + `/api/enqueue` treat the tab as closed after this much silence on
 * the page heartbeat (~3 missed long-poll windows; tolerates background-tab
 * throttling). Commands fail fast instead of hanging on a dead tab.
 */
export const HEARTBEAT_DEAD_MS = 90_000;

/**
 * Surfaced when the page heartbeat has gone stale (tab closed / crashed).
 * Single source of truth so the session client and the resolver emit the
 * identical reconnect instruction.
 */
export const TAB_CLOSED_MESSAGE =
  "The wallet session tab appears to be closed. Run 'genlayer wallet connect' to reconnect.";

/** Daemon self-terminates after sustained page silence (tab closed / crashed). */
export const TAB_DEAD_GRACE_MS = 10 * 60_000;

/** Daemon self-terminates when unused this long (config: walletSessionTtlMinutes). */
export const IDLE_TTL_MS = 30 * 60_000;

/** spawn → descriptor-written + /api/ping answers. */
export const DAEMON_READY_TIMEOUT_MS = 10_000;

/** Wallet connect wait (existing bridge behaviour). */
export const CONNECT_TIMEOUT_MS = 180_000;

/** Per-tx wallet confirmation wait (existing bridge behaviour). */
export const TX_TIMEOUT_MS = 300_000;

/** Descriptor file name under ~/.genlayer. */
export const SESSION_DESCRIPTOR_FILENAME = "wallet-session.json";

/** Daemon log file name under ~/.genlayer. */
export const DAEMON_LOG_FILENAME = "wallet-daemon.log";

/** Config key controlling the default signing mode ("keystore" | "browser"). */
export const WALLET_MODE_CONFIG_KEY = "walletMode";

/** Config key (minutes) overriding IDLE_TTL_MS. */
export const WALLET_SESSION_TTL_CONFIG_KEY = "walletSessionTtlMinutes";
