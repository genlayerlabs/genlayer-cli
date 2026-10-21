import {readFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const composeFile = readFileSync(resolve(repositoryRoot, "docker-compose.yml"), "utf-8");

function publishedPortsFor(service: string): string[] {
  const serviceBlock = composeFile.match(new RegExp(`^  ${service}:\\n([\\s\\S]*?)(?=^  \\S|\\Z)`, "m"));

  if (!serviceBlock) {
    throw new Error(`service "${service}" not found in docker-compose.yml`);
  }

  const portsBlock = serviceBlock[1].match(/^\s{4}ports:\n([\s\S]*?)(?=^\s{4}\S|\Z)/m);

  if (!portsBlock) {
    return [];
  }

  return [...portsBlock[1].matchAll(/^\s+- "([^"]+)"$/gm)].map(match => match[1]);
}

describe("docker-compose port bindings", () => {
  it("publishes postgres on loopback only", () => {
    expect(publishedPortsFor("postgres")).toEqual(["127.0.0.1:${DBPORT:-5432}:5432"]);
  });

  it("binds every published postgres port to an explicit host address", () => {
    for (const port of publishedPortsFor("postgres")) {
      expect(port).toMatch(/^127\.0\.0\.1:/);
    }
  });
});
