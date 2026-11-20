import {describe, it, expect} from "vitest";
import {Command} from "commander";
import {initializeAccountCommands} from "../src/commands/account";
import {markRequiredOptionsInHelp} from "../src/lib/cli/helpConfig";
// @ts-expect-error plain ESM script without type declarations
import {parseHelp, generatePageForCommand} from "../scripts/generate-cli-docs.mjs";

function generatePage(subcommand: string): string {
  const program = new Command().name("genlayer");
  markRequiredOptionsInHelp(program);
  initializeAccountCommands(program);
  const sub = program.commands.find(c => c.name() === "account")!.commands.find(c => c.name() === subcommand)!;
  const text = sub.helpInformation().replace(/^Usage: account/, "Usage: genlayer account");
  const help = parseHelp(text, "genlayer", `account ${subcommand}`);
  return generatePageForCommand(help, "genlayer", `account ${subcommand}`).content;
}

describe("generated CLI reference", () => {
  it("marks account create --name as required and the other options as optional", () => {
    const rows = generatePage("create").split("\n");
    const cell = (long: string) => rows.find(l => l.includes(`| ${long}`))!.split("|")[4].trim();
    expect(cell("--name &lt;name&gt;")).toBe("Yes");
    expect(cell("--password &lt;password&gt;")).toBe("No");
    expect(cell("--overwrite")).toBe("No");
    expect(rows.find(l => l.includes("--name"))).toContain("| Name for the account | Yes |");
  });
});
