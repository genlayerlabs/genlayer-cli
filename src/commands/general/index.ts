import { Command } from "commander";

import simulatorService from "../../lib/services/simulator";
import { InitAction, InitActionOptions } from "./init";
import { StartAction, StartActionOptions } from "./start";
import {localnetCompatibleVersion} from "../../lib/config/simulator";
import {StopAction} from "./stop";

export function initializeGeneralCommands(program: Command) {
  program
    .command("init")
    .description("Initialize the GenLayer Environment")
    .option("--numValidators <numValidators>", "Number of validators", "5")
    .option("--headless", "Headless mode", false)
    .option("--reset-db", "Reset Database", false)
    .option("--localnet-version <localnetVersion>", "Select a specific localnet version", localnetCompatibleVersion)
    .option("--ollama", "Enable Ollama container", false)
    .action(async (options: InitActionOptions) => {
      const initAction = new InitAction();
      await initAction.execute(options)
    });

  program
    .command("up")
    .description("Starts GenLayer's simulator")
    .option("--reset-validators", "Remove all current validators and create new random ones", false)
    .option("--numValidators <numValidators>", "Number of validators", "5")
    .option("--headless", "Headless mode", false)
    .option("--reset-db", "Reset Database", false)
    .option("--ollama", "Enable Ollama container", false)
    .action(async (options: StartActionOptions) => {
      const startAction = new StartAction();
      await startAction.execute(options);
    });

  program
    .command("stop")
    .description("Stop all running localnet services.")
    .action(async () => {
      const stopAction = new StopAction();
      await stopAction.stop();
    });

  return program;
}
