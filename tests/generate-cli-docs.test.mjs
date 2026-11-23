import {describe, expect, it} from "vitest";
import {parseHelp} from "../scripts/generate-cli-docs.mjs";

const help = `Usage: index staking validator-deposit [options]

Deposit more stake

Options:
  --name <name>                 Name for the account (required)
  --amount <amount>             Amount to deposit (in wei or with 'eth'/'gen'
                                suffix) (required)
  --fee <fee>                   Fee, long enough that the help output wraps onto
                                a second line (default: "5") (required)
  --account <name>              Account to use
  -h, --help                    display help for command
`;

describe("generate-cli-docs parseHelp", () => {
  const byName = Object.fromEntries(parseHelp(help, "genlayer", "staking validator-deposit").options.map(o => [o.long, o]));

  it("detects the required marker on a single line", () => {
    expect(byName["--name <name>"]).toMatchObject({required: true, description: "Name for the account"});
  });

  it("detects the required marker on a wrapped continuation line", () => {
    expect(byName["--amount <amount>"]).toMatchObject({
      required: true,
      description: "Amount to deposit (in wei or with 'eth'/'gen' suffix)",
    });
  });

  it("keeps defaults when the marker follows them", () => {
    expect(byName["--fee <fee>"]).toMatchObject({required: true, defaultValue: "5"});
  });

  it("leaves other options optional", () => {
    expect(byName["--account <name>"].required).toBe(false);
  });
});
