import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadNuxt } from "@nuxt/kit";
import { expect } from "@nuxvel/nuxt/testing";
import { beforeAll, describe, it } from "vitest";
import { playgroundDir, testBuildDir } from "./helpers/test-builds";

type Import = { name: string; as?: string; from: string };

const runtime = fileURLToPath(new URL("../src/runtime/", import.meta.url));
const publicImports = JSON.parse(
  readFileSync(fileURLToPath(new URL("../src/public-imports.json", import.meta.url)), "utf8"),
) as { name: string; side: string }[];

async function nitroImports() {
  const nuxt = await loadNuxt({
    cwd: playgroundDir,
    ready: false,
    overrides: { _prepare: true, buildDir: testBuildDir("server-imports") },
  });
  let imports: Import[] = [];

  nuxt.hook("nitro:init", async (nitro) => {
    imports = (await nitro.unimport?.getImports()) ?? [];
  });
  await nuxt.ready();
  await nuxt.close();

  return imports;
}

describe("server auto-imports", () => {
  let imports: Import[];
  let names: string[];

  beforeAll(async () => {
    imports = await nitroImports();
    names = imports.map((entry) => entry.as ?? entry.name);
  }, 120_000);

  it("keeps Nitro's own names global", () => {
    expect(names).toEqual(expect.arrayContaining(["defineEventHandler", "getQuery", "useRuntimeConfig", "useStorage"]));
  });

  it("auto-imports no file of the nuxvel runtime", () => {
    const fromNuxvel = imports.filter((entry) => entry.from.startsWith(runtime)).map((entry) => `${entry.as ?? entry.name} from ${entry.from}`);
    expect(fromNuxvel).toEqual([]);
  });

  it("auto-imports no name of the public import map", () => {
    const leaked = publicImports.filter((entry) => names.includes(entry.name)).map((entry) => entry.name);
    expect(leaked).toEqual([]);
  });

  it("auto-imports no $<kind> namespace", () => {
    expect(names.filter((name) => name.startsWith("$"))).toEqual([]);
  });

  it("auto-imports no export of shared/schemas", () => {
    const schemas = imports.filter((entry) => entry.from.includes("/shared/schemas/")).map((entry) => entry.name);
    expect(schemas).toEqual([]);
  });
});
