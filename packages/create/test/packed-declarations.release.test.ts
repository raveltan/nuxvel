import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { packNuxvel } from "@nuxvel/test-helpers/pack-nuxvel";
import { run } from "@nuxvel/test-helpers/run";

const repoDir = fileURLToPath(new URL("../../..", import.meta.url));
const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");
const heavyPackage = /\/node_modules\/(@aws-sdk|@smithy|bullmq|ioredis|stripe|nodemailer|@faker-js|@sentry\/node|storybook|msw)\//;

let scratchDir: string;
let dist: string;

async function autoImportedDeclarations() {
  const appDir = join(scratchDir, "app");
  mkdirSync(appDir);
  writeFileSync(join(appDir, "nuxt.config.ts"), `export default defineNuxtConfig({
  modules: ["../package/dist/module.mjs"],
  nuxvel: { mail: { from: "app <app@example.com>" }, pwa: { name: "app", themeColor: "#000000" }, billing: true },
})
`);
  const prepared = await run(process.execPath, [join(scratchDir, "node_modules/nuxt/bin/nuxt.mjs"), "prepare"], appDir);
  expect(prepared.exitCode, prepared.output).toBe(0);
  const typesDir = join(appDir, ".nuxt/types");
  const imported = ["imports.d.ts", "nitro-imports.d.ts"].flatMap((file) =>
    [...readFileSync(join(typesDir, file), "utf8").matchAll(/import\('([^']*\/package\/dist\/runtime\/[^']+)'\)/g)].flatMap(([, from]) => (from ? [`${resolve(typesDir, from)}.d.ts`] : [])),
  );
  return [...new Set(imported)];
}

async function explainProgram(name: string, files: string[]) {
  const tsconfig = join(scratchDir, `${name}.tsconfig.json`);
  writeFileSync(tsconfig, JSON.stringify({
    compilerOptions: { noEmit: true, module: "preserve", moduleResolution: "bundler", types: [], skipLibCheck: true },
    files,
  }));
  const { stdout } = await run(process.execPath, [tsc, "-p", tsconfig, "--explainFiles"], scratchDir);
  const importers = new Map<string, string[]>();
  let current = "";
  for (const line of stdout.split("\n")) {
    if (/^\S.*\.[cm]?tsx?$/.test(line)) {
      current = resolve(scratchDir, line);
      importers.set(current, []);
    } else {
      const importer = line.match(/^ {2}Imported via .* from file '([^']+)'/)?.[1];
      if (importer && current) importers.get(current)?.push(resolve(scratchDir, importer));
    }
  }
  return importers;
}

function chainTo(file: string, importers: Map<string, string[]>) {
  const chain = [file];
  for (let next = importers.get(file)?.[0]; next && !chain.includes(next); next = importers.get(next)?.[0]) chain.push(next);
  return chain.reverse().map((step) => step.replace(`${scratchDir}/package/`, "@nuxvel/nuxt/")).join("\n  -> ");
}

describe("the packed @nuxvel/nuxt", () => {
  beforeAll(async () => {
    scratchDir = realpathSync(mkdtempSync(join(tmpdir(), "nuxvel-declarations-")));
    const { vendorDir, nuxt } = await packNuxvel(scratchDir);
    const unpacked = await run("tar", ["xzf", join(vendorDir, nuxt)], scratchDir);
    expect(unpacked.exitCode, unpacked.output).toBe(0);
    dist = join(scratchDir, "package", "dist");
    symlinkSync(join(repoDir, "node_modules"), join(scratchDir, "node_modules"));
    symlinkSync(join(repoDir, "packages", "nuxt", "node_modules"), join(scratchDir, "package", "node_modules"));
  }, 600_000);

  afterAll(() => {
    if (scratchDir) rmSync(scratchDir, { recursive: true, force: true });
  });

  it("declares each subpath without loading the runtime files of the other subpaths", () => {
    const entries = readdirSync(dist, { recursive: true, encoding: "utf8" }).filter(
      (file) => file.endsWith(".d.mts") && !file.startsWith("runtime"),
    );
    const sideEffectImports = entries.flatMap((file) =>
      [...readFileSync(join(dist, file), "utf8").matchAll(/^import '[^']*\/runtime\/[^']*';$/gm)].map(([line]) => `${file}: ${line}`),
    );

    expect(entries).toContain("database.d.mts");
    expect(sideEffectImports).toEqual([]);
  });

  it("keeps the auto-imported and app-facing declarations clear of server SDK types", async () => {
    const roots = [...await autoImportedDeclarations(), join(dist, "database.d.mts")];
    expect(roots).toContain(join(dist, "runtime/server/clock/now.d.ts"));
    expect(roots.filter((file) => !existsSync(file))).toEqual([]);
    // every Nuxt app loads the types of Nitro, which reach ioredis through unstorage, so those files do not count
    writeFileSync(join(scratchDir, "nitro.ts"), 'import "nitropack/types";\nimport "nitropack/runtime";\n');

    const [program, nitro] = await Promise.all([
      explainProgram("declarations", roots),
      explainProgram("nitro", [join(scratchDir, "nitro.ts")]),
    ]);
    const heavyFiles = [...program.keys()].filter((file) => heavyPackage.test(file) && !nitro.has(file));
    const firstFilePerPackage = new Map(heavyFiles.map((file) => [file.match(heavyPackage)?.[1], file] as const).reverse());

    expect(program.has(join(dist, "database.d.mts"))).toBe(true);
    expect([...firstFilePerPackage.values()].map((file) => chainTo(file, program))).toEqual([]);
  }, 60_000);
});
