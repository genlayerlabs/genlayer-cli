import {describe, it, expect} from "vitest";
import {readFileSync} from "fs";
import {join} from "path";
import {Command} from "commander";
import {initializeAccountCommands} from "../src/commands/account";

describe("account CLI reference docs", () => {
  const program = new Command();
  initializeAccountCommands(program);
  const account = program.commands.find(c => c.name() === "account")!;

  for (const sub of account.commands.filter(c => ["create", "import"].includes(c.name()))) {
    it(`marks mandatory options of "account ${sub.name()}" as required`, () => {
      const doc = readFileSync(
        join(__dirname, "..", "docs/api-references/accounts/account", `${sub.name()}.mdx`),
        "utf8",
      );
      for (const option of sub.options) {
        const row = doc.split("\n").find(l => l.includes(`| ${option.long} `));
        expect(row, `row for ${option.long}`).toBeDefined();
        const required = row!.split("|")[4].trim();
        expect(required).toBe(option.mandatory ? "Yes" : "No");
      }
    });
  }
});
