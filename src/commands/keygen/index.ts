import { Command } from "commander";
import { CreateKeypairOptions, KeypairCreator } from "./create";
import { UnlockAction } from "./unlock";
import { LockAction } from "./lock";

export function initializeKeygenCommands(program: Command) {

  const keygenCommand = program
    .command("keygen")
    .description("Manage keypair generation");

  keygenCommand
    .command("create")
    .description("Generates a new encrypted keystore and saves it to a file")
    .option("--output <path>", "Path to save the keystore", "./keypair.json")
    .option("--overwrite", "Overwrite the existing file if it already exists", false)
    .action(async (options: CreateKeypairOptions) => {
      const keypairCreator = new KeypairCreator();
      await keypairCreator.createKeypairAction(options);
    });

  keygenCommand
    .command("unlock")
    .description("Unlock your wallet by storing the decrypted private key in OS keychain")
    .action(async () => {
      const unlockAction = new UnlockAction();
      await unlockAction.execute();
    });

  keygenCommand
    .command("lock")
    .description("Lock your wallet by removing the decrypted private key from OS keychain")
    .action(async () => {
      const lockAction = new LockAction();
      await lockAction.execute();
    });

  return program;
}
