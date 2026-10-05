import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, realpath } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { promisify } from "node:util";
import type { loadNuxtConfig } from "@nuxt/kit";
import { serialize } from "ohash";
import { glob } from "tinyglobby";
import { z } from "zod";

type AppOptions = Awaited<ReturnType<typeof loadNuxtConfig>>;

export type BuildInputs = Record<string, string>;

type Layer = AppOptions["_layers"][number];

const LOCKFILES = ["package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock"];

const NOT_BUILT = ["*.md", "test/**", "tests/**"];

const DEV_ONLY = ["client-dist/**"];

const manifestSchema = z.object({
  version: z.string().optional(),
  dependencies: z.record(z.string(), z.string()).optional(),
  devDependencies: z.record(z.string(), z.string()).optional(),
});

function digest(content: string | Buffer, length = 16) {
  return createHash("sha256").update(content).digest("hex").slice(0, length);
}

async function readManifest(dir: string) {
  return manifestSchema.parse(JSON.parse(await readFile(join(dir, "package.json"), "utf8")));
}

async function addFiles(inputs: BuildInputs, label: string, dir: string, ignore: string[], patterns = ["**", ".nuxtrc", ".npmrc"], kept?: Set<string>) {
  const files = await glob(patterns, { cwd: dir, ignore: ["**/node_modules/**", ...ignore], onlyFiles: true });
  const hashed = kept ? files.filter((file) => kept.has(file) || file.startsWith(".")) : files;

  for (const file of hashed) inputs[`${label}${file}`] = digest(await readFile(join(dir, file)));
}

async function gitFiles(dir: string) {
  try {
    const args = ["ls-files", "-z", "--cached", "--others", "--exclude-standard"];
    const { stdout } = await promisify(execFile)("git", args, { cwd: dir, maxBuffer: 256 * 1024 * 1024 });
    const files = stdout.split("\0").filter(Boolean);
    return files.length > 0 ? new Set(files) : undefined;
  } catch {
    return undefined;
  }
}

function withinNodeModules(path: string) {
  return path.split(sep).includes("node_modules");
}

function isLocalSpec(spec: string | undefined) {
  return spec?.startsWith("file:") || spec?.startsWith("link:");
}

function installedPackageDir(rootDir: string, name: string) {
  for (let dir = rootDir; ; dir = dirname(dir)) {
    const candidate = join(dir, "node_modules", name);
    if (existsSync(join(candidate, "package.json"))) return candidate;
    if (dirname(dir) === dir) return undefined;
  }
}

function nearestLockfile(rootDir: string) {
  for (let dir = rootDir; ; dir = dirname(dir)) {
    const lockfile = LOCKFILES.map((name) => join(dir, name)).find((path) => existsSync(path));
    if (lockfile || dirname(dir) === dir) return lockfile;
  }
}

async function addDependencies(inputs: BuildInputs, options: AppOptions) {
  const { rootDir } = options;
  const manifest = existsSync(join(rootDir, "package.json")) ? await readManifest(rootDir) : {};
  const specs = { ...manifest.dependencies, ...manifest.devDependencies };
  const names = Object.keys(specs).sort();

  for (const name of names) {
    const installed = installedPackageDir(rootDir, name);
    if (!installed) {
      inputs[`dependency ${name}`] = "missing";
      continue;
    }

    const dir = await realpath(installed);
    inputs[`dependency ${name}`] = (await readManifest(dir)).version ?? "";
    if (!withinNodeModules(dir) || isLocalSpec(specs[name])) await addFiles(inputs, `${name}/`, dir, [...options.ignore, ...NOT_BUILT, ...DEV_ONLY]);
  }

  const lockfile = nearestLockfile(rootDir);
  inputs.lockfile = lockfile ? digest(await readFile(lockfile)) : "none";
}

function envPrefixes(options: AppOptions) {
  const prefix = options.vite.envPrefix ?? "VITE_";
  return Array.isArray(prefix) ? prefix : [prefix];
}

const SHELL_VARIABLES =
  /^(npm_|TERM|COLORTERM|TMUX|SSH_|SHLVL$|PATH$|EDITOR$|AI_AGENT$|CLAUDECODE$|CLAUDE_CODE$|REPL_ID$|GEMINI_CLI$|CODEX_|OPENCODE$|AUGMENT_AGENT$|GOOSE_PROVIDER$|JUNIE_|CURSOR_AGENT$)/;

/**
 * Hashes the current value of each environment variable in `names`, one input per variable.
 * Skips the variables of the shell and of `npm run` (`npm_*`, `TERM*`, `COLORTERM`, `TMUX*`, `SSH_*`, `SHLVL`, `PATH`)
 * and the ones the AI agent check of std-env reads (`AI_AGENT`, `CLAUDECODE`, `EDITOR`, ...),
 * which a dependency reads during the build but which change with the terminal, the script and the agent.
 *
 * @internal Used by {@link cachedBuild} for the variables a build read.
 */
export function envInputs(names: Iterable<string>): BuildInputs {
  return Object.fromEntries([...names].filter((name) => !SHELL_VARIABLES.test(name)).map((name) => [`env ${name}`, digest(JSON.stringify(process.env[name] ?? null))]));
}

/**
 * Returns the names of the environment variables that `inputs` hash.
 *
 * @internal Used by {@link cachedBuild}.
 */
export function envNames(inputs: BuildInputs) {
  return Object.keys(inputs)
    .filter((label) => label.startsWith("env "))
    .map((label) => label.slice("env ".length));
}

function inside(parent: string, path: string) {
  const within = relative(parent, path);
  return within === "" || within.startsWith("..") ? undefined : within.split(sep).join("/");
}

function clientOnlyDirs(layer: Layer, options: AppOptions) {
  const { srcDir, serverDir } = layer.config;
  const holdsServer = srcDir !== undefined && serverDir !== undefined && inside(srcDir, serverDir) !== undefined;
  const appDir = srcDir === undefined || holdsServer ? undefined : inside(layer.cwd, srcDir);

  return [appDir, inside(layer.cwd, options.dir.public)].filter((dir) => dir !== undefined);
}

async function addLayers(inputs: BuildInputs, options: AppOptions, client: boolean) {
  for (const layer of options._layers) {
    if (withinNodeModules(layer.cwd)) continue;

    const label = layer.cwd === options.rootDir ? "" : `${relative(options.rootDir, layer.cwd)}/`;
    const clientDirs = client ? [] : clientOnlyDirs(layer, options);
    const outputs = [options.buildDir, join(options.rootDir, ".output")].map((dir) => inside(layer.cwd, dir));
    const skipped = [...outputs, ...clientDirs].filter((dir) => dir !== undefined).map((dir) => `${dir}/**`);

    const kept = await gitFiles(layer.cwd);
    await addFiles(inputs, label, layer.cwd, [...skipped, ...options.ignore, ...NOT_BUILT], undefined, kept);
    for (const dir of clientDirs) await addFiles(inputs, label, layer.cwd, [], [`${dir}/app.config.*`], kept);
  }
}

/**
 * Hashes every input of an app build: the resolved Nuxt config, the files of each
 * local layer and the installed dependencies. Of the environment, it hashes only
 * `NODE_ENV` and the variables Vite gives to the client (`VITE_*`). {@link cachedBuild}
 * adds the variables that the build itself reads.
 *
 * @param options.client Include the client-only folders (`app/` and `public/`). Without it, only `app.config.*` is in the inputs.
 * @param options.recipe A label for how the caller builds the app. A change to it makes a new build.
 * @example
 * const inputs = await buildInputs(await loadNuxtConfig({ cwd }), { client: false, recipe: "cli 1.0.0" });
 *
 * @internal Shared by `@nuxvel/cli` and the test global setup. Use it with {@link cachedBuild}.
 */
export async function buildInputs(options: AppOptions, { client, recipe }: { client: boolean; recipe: string }): Promise<BuildInputs> {
  const inputs: BuildInputs = {
    "nuxt.config": digest(serialize(options).replaceAll(options.buildId, "")),
    "Node or nuxvel version": digest(`node ${process.version}\0${recipe}`),
    ...envInputs(["NODE_ENV", ...Object.keys(process.env).filter((name) => envPrefixes(options).some((prefix) => name.startsWith(prefix)))]),
  };

  await addLayers(inputs, options, client);
  await addDependencies(inputs, options);

  return inputs;
}

export function buildKey(inputs: BuildInputs) {
  return digest(serialize(Object.entries(inputs).sort(([a], [b]) => a.localeCompare(b))), 24);
}

export function rebuildReason(inputs: BuildInputs, previous: BuildInputs | undefined) {
  if (!previous) return "no earlier build";

  const labels = [...new Set([...Object.keys(inputs), ...Object.keys(previous)])].sort();
  const changed = labels.find((label) => inputs[label] !== previous[label]);

  if (changed === undefined) return "no earlier build";
  if (!(changed in previous)) return `${changed} added`;
  return changed in inputs ? `${changed} changed` : `${changed} removed`;
}
