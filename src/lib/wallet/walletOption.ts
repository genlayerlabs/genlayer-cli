import type {Command} from "commander";

/**
 * Shared registrar for the `--wallet <mode>` signing-mode flag. Applied to every
 * write command so keystore (default) and browser (MetaMask via local bridge)
 * are selectable uniformly. Mutual exclusion with --password/--account is
 * enforced in the Action layer (BaseAction.assertWalletFlags), not commander,
 * so it stays testable and reusable.
 */
export const WALLET_OPTION_FLAG = "--wallet <mode>";
export const WALLET_OPTION_DESC =
  "Signing mode: 'keystore' or 'browser' (sign in MetaMask via a local bridge; " +
  "forward the port for remote/SSH: ssh -L <port>:127.0.0.1:<port>). " +
  "Defaults to the 'walletMode' config value, else 'keystore'.";

/**
 * No commander default: with one, "flag omitted" is indistinguishable from an
 * explicit "--wallet keystore", which would break the config-default override.
 * The default is resolved in BaseAction.resolveWalletMode (config > keystore).
 */
export function addWalletModeOption(cmd: Command): Command {
  return cmd.option(WALLET_OPTION_FLAG, WALLET_OPTION_DESC);
}
