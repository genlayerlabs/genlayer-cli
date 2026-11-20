import {Help} from "commander";
import type {Command} from "commander";

/**
 * When generating the CLI reference (GENLAYER_DOCS_MARK_REQUIRED=1), flags mandatory options with "(required)". Commander does not
 * do this itself, and the generator reads the help text. Normal `--help` output is unchanged.
 * Call before subcommands are created so they inherit the setting.
 */
export function markRequiredOptionsInHelp(command: Command): Command {
  return command.configureHelp({
    optionDescription: option => {
      const description = Help.prototype.optionDescription.call(new Help(), option);
      return option.mandatory && process.env.GENLAYER_DOCS_MARK_REQUIRED === "1" ? `${description} (required)` : description;
    },
  });
}
