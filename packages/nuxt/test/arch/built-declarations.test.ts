import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect } from "@nuxvel/nuxt/testing";
import { afterAll, beforeAll, describe, it } from "vitest";
import { findDegradedDeclarations } from "./built-declarations";

const execFileAsync = promisify(execFile);
const packageDir = fileURLToPath(new URL("../..", import.meta.url));
const moduleBuilder = fileURLToPath(new URL("../../../../node_modules/@nuxt/module-builder/dist/cli.mjs", import.meta.url));
const scratchDir = join(packageDir, ".nuxvel-test-declarations");
const outDir = join(scratchDir, "dist");

function scratchFiles(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "nuxvel-arch-"));

  for (const [file, source] of Object.entries(files)) {
    mkdirSync(join(dir, file, ".."), { recursive: true });
    writeFileSync(join(dir, file), source);
  }

  return dir;
}

describe("arch: the built runtime declarations keep their source's types", () => {
  beforeAll(async () => {
    const { NODE_OPTIONS: _callersNodeOptions, ...env } = process.env;

    await execFileAsync(process.execPath, [moduleBuilder, "build", "--outDir", outDir], { cwd: packageDir, env });
  }, 120_000);

  afterAll(() => {
    rmSync(scratchDir, { recursive: true, force: true });
  });

  it("finds no declaration with an any its source doesn't write", () => {
    expect(findDegradedDeclarations(join(outDir, "runtime"), join(packageDir, "src", "runtime"))).toEqual([]);
  });

  it("resolves the command plugin from a top-level file, not a shared chunk one folder down", () => {
    const sharedChunks = readdirSync(join(outDir, "shared")).filter((file) =>
      readFileSync(join(outDir, "shared", file), "utf8").includes("./runtime/server/plugins/command"),
    );

    expect(sharedChunks).toEqual([]);
    expect(readFileSync(join(outDir, "cli.mjs"), "utf8")).toContain("./runtime/server/plugins/command");
  });

  it("flags a declaration whose inferred type became any", () => {
    const source = scratchFiles({
      "db.ts": 'import * as schema from "#nuxvel/schema";\nexport const useDb = () => drizzle(schema);',
    });
    const declarations = scratchFiles({
      "db.d.ts": "export declare const useDb: () => PostgresJsDatabase<any>;",
    });

    try {
      expect(findDegradedDeclarations(declarations, source)).toEqual(["db.d.ts: 1 any not in its source"]);
    } finally {
      rmSync(source, { recursive: true, force: true });
      rmSync(declarations, { recursive: true, force: true });
    }
  });
});
