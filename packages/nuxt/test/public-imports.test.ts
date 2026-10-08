import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";

type Entry = { name: string; kind: string; side: string; file: string; path: string };

const committed = JSON.parse(
  readFileSync(fileURLToPath(new URL("../src/public-imports.json", import.meta.url)), "utf8"),
) as Entry[];

function exportedNames(entryFile: string) {
  const text = readFileSync(entryFile, "utf8");

  return new Set(
    [...text.matchAll(/^export (?:type )?\{([^}]*)\} from /gm)].flatMap(([, list = ""]) =>
      list.split(",").map((item) => item.trim().split(/\s+as\s+/).pop() ?? ""),
    ),
  );
}

describe("public imports map", () => {
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

  it("exports every entry from its topic entry file", () => {
    const unexported = committed
      .filter((entry) => {
        const topic = entry.path.replace("@nuxvel/nuxt/", "");
        const entryFile = fileURLToPath(new URL(`../src/${topic}.ts`, import.meta.url));

        return !existsSync(entryFile) || !exportedNames(entryFile).has(entry.name);
      })
      .map((entry) => `${entry.name}: ${entry.path}`);
    expect(unexported, "entries the topic file does not export").toEqual([]);
  });
});
