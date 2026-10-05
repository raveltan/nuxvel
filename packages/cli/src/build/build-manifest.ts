import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { familySync } from "detect-libc";
import { readMigrationsConfig } from "../database/migrations-config.ts";

/**
 * What `nuxvel-manifest.json` records about a build: which app and
 * commit it is, and the machine it was built on — the platform, CPU
 * architecture, C library and Node version it only runs correctly on.
 */
export interface BuildManifest {
  app: string;
  version: string | null;
  commit: string | null;
  source: "ci" | "local";
  builtAt: string;
  node: string;
  platform: NodeJS.Platform;
  arch: NodeJS.Architecture;
  libc: "glibc" | "musl" | null;
  nuxt: string | null;
  nuxvel: string | null;
  migrations: number;
}

export const MANIFEST_FILE = "nuxvel-manifest.json";

function readJson(path: string) {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : undefined;
}

function installedVersion(cwd: string, name: string): string | null {
  return readJson(join(cwd, "node_modules", name, "package.json"))?.version ?? null;
}

function gitCommit(cwd: string) {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

async function countMigrations(cwd: string) {
  const folder = (await readMigrationsConfig(cwd)).migrationsFolder;

  return existsSync(folder) ? readdirSync(folder).filter((file) => file.endsWith(".sql")).length : 0;
}

function libc(): BuildManifest["libc"] {
  const family = familySync();

  return family === "glibc" || family === "musl" ? family : null;
}

/**
 * The part of a {@link BuildManifest} a build only runs correctly on:
 * this machine's Node version, platform, CPU architecture and C library.
 */
export function describeMachine() {
  return {
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    libc: libc(),
  };
}

async function describeBuild(cwd: string): Promise<BuildManifest> {
  const pkg = readJson(join(cwd, "package.json")) ?? {};
  const source = process.env.NUXVEL_BUILD_SOURCE || (process.env.CI ? "ci" : "local");

  return {
    app: pkg.name ?? "app",
    version: pkg.version ?? null,
    commit: process.env.NUXVEL_GIT_COMMIT || gitCommit(cwd),
    source: source === "ci" ? "ci" : "local",
    builtAt: new Date().toISOString(),
    ...describeMachine(),
    nuxt: installedVersion(cwd, "nuxt"),
    nuxvel: installedVersion(cwd, "@nuxvel/nuxt"),
    migrations: await countMigrations(cwd),
  };
}

/**
 * Writes the {@link BuildManifest} of the build in `cwd` to
 * `nuxvel-manifest.json`. Runs right after `nuxt build`, on the machine
 * that built it. `NUXVEL_GIT_COMMIT` and `NUXVEL_BUILD_SOURCE` override
 * the commit and source where git and `CI` are not visible, like inside
 * a Docker build.
 */
export async function writeBuildManifest(cwd: string) {
  const manifest = await describeBuild(cwd);

  writeFileSync(join(cwd, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);

  return manifest;
}
