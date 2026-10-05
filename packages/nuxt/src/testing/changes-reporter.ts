/**
 * Vitest reporter that records which app files each test file ran. It
 * does nothing when `NUXVEL_CHANGES_DIR` is not set.
 *
 * When a test file ends, it reads the V8 coverage of the server that
 * `@nuxvel/nuxt/testing/setup` started for the file, and the modules that the test process loaded
 * (see `@nuxvel/nuxt/testing/setup`). It keeps each function that ran
 * at least once, and uses the server's source maps to find its file. It
 * keeps only the files in the project root, outside `node_modules`. Then
 * it deletes the raw coverage.
 *
 * At the end of the run, it writes
 * `node_modules/.cache/nuxvel/changes.json` with three keys:
 *
 * - `hashes`: the SHA-1 hash of each project file. It does not hash
 *   `node_modules`, `dist` and the folders whose names start with `.`.
 * - `map`: for each test file, the app files that it ran.
 * - `failed`: the test files that failed.
 *
 * All paths are relative to the project root. After a run of only some
 * test files, the reporter keeps the `map` entries and the `failed`
 * entries of the test files that did not run.
 *
 * @example
 * ```ts
 * export default defineConfig({
 *   test: {
 *     reporters: ["default", "@nuxvel/nuxt/testing/changes-reporter"],
 *   },
 * });
 * ```
 *
 * @packageDocumentation
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { TraceMap, originalPositionFor } from "@jridgewell/trace-mapping";
import type { Reporter, TestModule, Vitest } from "vitest/node";
import { changesDirFor } from "./changes-dir";

interface ScriptCoverage {
  url: string;
  functions: { ranges: { startOffset: number; count: number }[] }[];
}

interface MappedScript {
  map: TraceMap;
  lineStarts: number[];
}

function lineStartsOf(code: string) {
  const starts = [0];
  for (let index = code.indexOf("\n"); index !== -1; index = code.indexOf("\n", index + 1)) starts.push(index + 1);
  return starts;
}

function positionAt(lineStarts: number[], offset: number) {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if ((lineStarts[middle] ?? 0) <= offset) low = middle;
    else high = middle - 1;
  }
  return { line: low + 1, column: offset - (lineStarts[low] ?? 0) };
}

function projectFiles(dir: string, root = dir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist" ? [] : projectFiles(path, root);
    }
    return entry.isFile() ? [relative(root, path)] : [];
  });
}

function hashOf(path: string) {
  return createHash("sha1").update(readFileSync(path)).digest("hex");
}

/**
 * Records, for each test file, the app files that it ran, and writes
 * them to `node_modules/.cache/nuxvel/changes.json`.
 */
export default class ChangesReporter implements Reporter {
  private rootDir = "";
  private readonly scripts = new Map<string, MappedScript | undefined>();
  private readonly map: Record<string, string[]> = {};
  private readonly failed: string[] = [];

  onInit(vitest: Vitest) {
    this.rootDir = vitest.config.root;
  }

  onTestModuleEnd(testModule: TestModule) {
    const changesDir = process.env.NUXVEL_CHANGES_DIR;
    if (!changesDir) return;

    const dir = changesDirFor(changesDir, testModule.moduleId);
    const files = new Set<string>([testModule.moduleId]);
    const modulesFile = join(dir, "modules.json");
    const coverageDir = join(dir, "coverage");

    if (existsSync(modulesFile)) {
      const modules: string[] = JSON.parse(readFileSync(modulesFile, "utf8"));
      for (const file of modules) files.add(file);
    }
    if (existsSync(coverageDir)) {
      for (const name of readdirSync(coverageDir)) {
        const { result }: { result: ScriptCoverage[] } = JSON.parse(readFileSync(join(coverageDir, name), "utf8"));
        for (const script of result) this.addCalledSources(script, files);
      }
    }
    rmSync(dir, { recursive: true, force: true });

    const key = relative(this.rootDir, testModule.moduleId);
    this.map[key] = [...files]
      .map((file) => relative(this.rootDir, file))
      .filter((file) => file !== key && !file.startsWith("..") && !file.split("/").includes("node_modules") && existsSync(join(this.rootDir, file)))
      .sort();
    if (testModule.state() === "failed") this.failed.push(key);
  }

  onTestRunEnd() {
    if (!process.env.NUXVEL_CHANGES_DIR) return;

    const out = join(this.rootDir, "node_modules", ".cache", "nuxvel", "changes.json");
    const previous: { map: Record<string, string[]>; failed: string[] } = existsSync(out)
      ? JSON.parse(readFileSync(out, "utf8"))
      : { map: {}, failed: [] };
    const keeps = (file: string) => !(file in this.map) && existsSync(join(this.rootDir, file));
    const map = Object.fromEntries(
      [...Object.entries(previous.map).filter(([file]) => keeps(file)), ...Object.entries(this.map)].sort(([a], [b]) => a.localeCompare(b)),
    );
    const failed = [...previous.failed.filter(keeps), ...this.failed].sort();
    const hashes = Object.fromEntries(projectFiles(this.rootDir).sort().map((path) => [path, hashOf(join(this.rootDir, path))]));

    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify({ hashes, map, failed }, null, 2)}\n`);
  }

  private mappedScript(url: string) {
    if (this.scripts.has(url)) return this.scripts.get(url);

    const path = url.startsWith("file:") ? fileURLToPath(url) : "";
    const mapPath = `${path}.map`;
    const script =
      path && existsSync(mapPath)
        ? { map: new TraceMap(readFileSync(mapPath, "utf8"), mapPath), lineStarts: lineStartsOf(readFileSync(path, "utf8")) }
        : undefined;
    this.scripts.set(url, script);
    return script;
  }

  private addCalledSources(script: ScriptCoverage, files: Set<string>) {
    const mapped = this.mappedScript(script.url);
    if (!mapped) return;

    for (const { ranges } of script.functions) {
      const [range] = ranges;
      if (!range || range.count === 0 || range.startOffset === 0) continue;
      const { source } = originalPositionFor(mapped.map, positionAt(mapped.lineStarts, range.startOffset));
      if (source) files.add(source);
    }
  }
}
