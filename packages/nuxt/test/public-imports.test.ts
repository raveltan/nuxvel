import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));
const script = fileURLToPath(new URL("../scripts/list-public-names.mjs", import.meta.url));

type Entry = { name: string; kind: string; side: string; file: string; path: string };

const committed = JSON.parse(
  readFileSync(fileURLToPath(new URL("../src/public-imports.json", import.meta.url)), "utf8"),
) as Entry[];

describe("public imports map", () => {
  it("matches what the script collects", () => {
    const output = execFileSync("node", [script], { encoding: "utf8", cwd: root });
    expect(JSON.parse(output)).toEqual(committed);
  });

  it("gives every entry a topic path and one name each", () => {
    const keyed = committed.map((entry) => `${entry.name} ${entry.kind}`);
    expect(new Set(keyed).size, "duplicate entries").toBe(keyed.length);
    const withoutPath = committed.filter((entry) => !/^@nuxvel\/nuxt\/(server|app|shared)\/[a-z0-9]+$/.test(entry.path));
    expect(withoutPath, "entries without a topic path").toEqual([]);
  });

  it("keeps the $kind namespaces out of the map", () => {
    const namespaced = committed.filter((entry) => entry.name.startsWith("$") && entry.name !== "$api");
    expect(namespaced, "namespaces in the map").toEqual([]);
  });

  it("lists only files that exist", () => {
    const missing = committed
      .filter((entry) => !existsSync(fileURLToPath(new URL(`../src/${entry.file}`, import.meta.url))))
      .map((entry) => `${entry.name}: ${entry.file}`);
    expect(missing, "missing files").toEqual([]);
  });
});
