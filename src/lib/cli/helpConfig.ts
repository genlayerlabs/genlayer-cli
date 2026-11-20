import {Help} from "commander";
import type {Command} from "commander";

/**
 * Makes `--help` flag mandatory options with "(required)". Commander does not
 * do this itself, and the generated CLI reference reads the help text.
 * Call before subcommands are created so they inherit the setting.
 */
export function markRequiredOptionsInHelp(command: Command): Command {
  return command.configureHelp({
    optionDescription: option => {
      const description = Help.prototype.optionDescription.call(new Help(), option);
      return option.mandatory ? `${description} (required)` : description;
    },
  });
}
