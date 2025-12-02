#!/usr/bin/env node
import {program} from "commander";
import {version} from "../package.json";
import {CLI_DESCRIPTION} from "../src/lib/config/text";
import {initializeGeneralCommands} from "../src/commands/general";
import {initializeAccountCommands} from "../src/commands/account";
import {initializeContractsCommands} from "../src/commands/contracts";
import {initializeConfigCommands} from "../src/commands/config";
import {initializeValidatorCommands} from "../src/commands/localnet";
import {initializeUpdateCommands} from "../src/commands/update";
import {initializeScaffoldCommands} from "../src/commands/scaffold";
import {initializeNetworkCommands} from "../src/commands/network";
import {initializeTransactionsCommands} from "../src/commands/transactions";
import {initializeStakingCommands} from "../src/commands/staking";

export function initializeCLI() {
  program.version(version).description(CLI_DESCRIPTION);
  initializeGeneralCommands(program);
  initializeAccountCommands(program);
  initializeContractsCommands(program);
  initializeConfigCommands(program);
  initializeUpdateCommands(program);
  initializeValidatorCommands(program);
  initializeScaffoldCommands(program);
  initializeNetworkCommands(program);
  initializeTransactionsCommands(program);
  initializeStakingCommands(program);
  program.parse(process.argv);
}

initializeCLI();
