import {describe, it, expect, beforeEach, afterEach} from "vitest";
import {Command} from "commander";
import {initializeAccountCommands} from "../src/commands/account";
import {markRequiredOptionsInHelp} from "../src/lib/cli/helpConfig";
// @ts-expect-error plain ESM script without type declarations
import {parseHelp, generatePageForCommand} from "../scripts/generate-cli-docs.mjs";

function helpText(subcommand: string): string {
  const program = new Command().name("genlayer");
  markRequiredOptionsInHelp(program);
  initializeAccountCommands(program);
  const sub = program.commands.find(c => c.name() === "account")!.commands.find(c => c.name() === subcommand)!;
  return sub.helpInformation().replace(/^Usage: account/, "Usage: genlayer account");
}

function generatePage(subcommand: string): string {
  const path = `account ${subcommand}`;
  return generatePageForCommand(parseHelp(helpText(subcommand), "genlayer", path), "genlayer", path).content;
}

const cell = (page: string, long: string) =>
  page.split("\n").find(l => l.includes(`| ${long}`))!.split("|")[4].trim();

describe("generated CLI reference", () => {
  const original = process.env.GENLAYER_DOCS_MARK_REQUIRED;
  beforeEach(() => {
    process.env.GENLAYER_DOCS_MARK_REQUIRED = "1";
  });
  afterEach(() => {
    if (original === undefined) delete process.env.GENLAYER_DOCS_MARK_REQUIRED;
    else process.env.GENLAYER_DOCS_MARK_REQUIRED = original;
  });

  it("marks account create --name as required and the other options as optional", () => {
    const page = generatePage("create");
    expect(cell(page, "--name &lt;name&gt;")).toBe("Yes");
    expect(cell(page, "--password &lt;password&gt;")).toBe("No");
    expect(cell(page, "--overwrite")).toBe("No");
    expect(page).not.toContain("(required)");
  });

  it("leaves other commands' published pages unchanged", () => {
    const page = generatePage("import");
    expect(cell(page, "--name &lt;name&gt;")).toBe("No");
    expect(page).not.toContain("(required)");
  });

  it("does not change normal --help output", () => {
    delete process.env.GENLAYER_DOCS_MARK_REQUIRED;
    expect(helpText("create")).not.toContain("(required)");
  });
});
