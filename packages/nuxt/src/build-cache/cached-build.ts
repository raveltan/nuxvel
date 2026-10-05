import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, realpath, rm, stat, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { type BuildInputs, buildKey, envInputs, envNames, rebuildReason } from "./build-key";

const KEPT_BUILDS = 2;
const USERS = ".users";
const READY = "ready";
const LOCK = ".lock";
const INPUTS = "inputs.json";

/**
 * One build in the cache, held by this process until {@link CachedBuild.release}.
 *
 * @internal Returned by {@link cachedBuild}.
 */
export interface CachedBuild {
  dir: string;
  builtAt: Date;
  built: boolean;
  reason: string | undefined;
  release(): Promise<void>;
}

/**
 * Tells if a process with this pid runs.
 *
 * @internal Shared by the build cache and `@nuxvel/cli`.
 */
export function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (failure) {
    return (failure as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function inUse(dir: string) {
  const users = await readdir(join(dir, USERS)).catch(() => []);
  return users.some((user) => alive(Number(user)));
}

async function lockHolder(lock: string) {
  return Number(await readFile(join(lock, "pid"), "utf8").catch(() => "0"));
}

async function acquire(dir: string) {
  if (!existsSync(join(dir, READY))) return undefined;

  const marker = join(dir, USERS, String(process.pid));
  const acquired = await mkdir(join(dir, USERS), { recursive: true })
    .then(() => writeFile(marker, ""))
    .then(() => existsSync(join(dir, READY)), () => false);

  if (!acquired) return undefined;

  const now = new Date();
  await utimes(dir, now, now);

  return { builtAt: (await stat(join(dir, READY))).mtime, release: () => rm(marker, { force: true }) };
}

async function takeLock(lock: string): Promise<boolean> {
  try {
    await mkdir(lock);
  } catch (failure) {
    if ((failure as NodeJS.ErrnoException).code !== "EEXIST") throw failure;

    const holder = await lockHolder(lock);
    const lockedAt = (await stat(lock).catch(() => undefined))?.mtimeMs ?? Date.now();
    const abandoned = holder === 0 ? Date.now() - lockedAt > 5000 : !alive(holder);
    if (!abandoned) return false;

    await rm(lock, { recursive: true, force: true });
    return takeLock(lock);
  }

  await writeFile(join(lock, "pid"), String(process.pid));
  return true;
}

async function builds(cacheDir: string, rootDir: string, removeOrphans = false) {
  const ours: { dir: string; modified: number }[] = [];

  for (const name of await readdir(cacheDir)) {
    const dir = join(cacheDir, name);
    if (name.endsWith(LOCK) || existsSync(`${dir}${LOCK}`)) continue;

    const builtFor = await readFile(join(dir, "root"), "utf8").catch(() => undefined);
    if (builtFor === rootDir) ours.push({ dir, modified: (await stat(dir)).mtimeMs });
    else if (removeOrphans && !(builtFor && existsSync(builtFor)) && !(await inUse(dir))) await rm(dir, { recursive: true, force: true });
  }

  return ours.sort((a, b) => b.modified - a.modified).map(({ dir }) => dir);
}

async function prune(cacheDir: string, rootDir: string) {
  for (const dir of (await builds(cacheDir, rootDir, true)).slice(KEPT_BUILDS)) {
    if (!(await inUse(dir))) await rm(dir, { recursive: true, force: true });
  }
}

async function readyInputs(dir: string): Promise<BuildInputs | undefined> {
  if (!existsSync(join(dir, READY))) return undefined;

  return JSON.parse(await readFile(join(dir, INPUTS), "utf8").catch(() => "null")) ?? undefined;
}

async function lastInputs(cacheDir: string, rootDir: string) {
  const [last] = await builds(cacheDir, rootDir);
  return last ? readyInputs(last) : undefined;
}

function withEnv(inputs: BuildInputs, of: BuildInputs | undefined) {
  return { ...inputs, ...envInputs(of ? envNames(of) : []) };
}

async function reuse(cacheDir: string, rootDir: string, inputs: BuildInputs) {
  for (const dir of await builds(cacheDir, rootDir)) {
    const stored = await readyInputs(dir);
    if (!stored || buildKey(stored) !== buildKey(withEnv(inputs, stored))) continue;

    const cached = await acquire(dir);
    if (cached) return { dir, built: false, reason: undefined, ...cached };
  }
  return undefined;
}

/**
 * Returns a cached build that has these inputs, or makes it with `build` when no build has them.
 *
 * A build has the inputs when they are equal, and each environment variable that the build
 * read has the value it had then. `build` returns the names of these variables, from {@link recordEnvReads}.
 * The build stays in `cacheDir/<key>` and is kept while a process uses it.
 * Only one process at a time makes a build for a key. The others wait for it.
 * After a new build, only the two newest builds of `rootDir` stay, and builds
 * of an app that is not there are removed.
 *
 * @param options.cacheDir The folder that holds the builds.
 * @param options.rootDir The app. Each build records it, so apps can share one `cacheDir`.
 * @param options.inputs From {@link buildInputs}.
 * @param options.build Makes the build in `dir`. It returns the names of the environment variables it read, or `undefined` when the build failed.
 * @returns `undefined` when `build` failed. `built` is `true` and `reason` names the changed input when this call made the build.
 * @example
 * const cached = await cachedBuild({ cacheDir, rootDir, inputs, build: (dir) => recordEnvReads(() => buildApp(dir)) });
 * if (cached) await cached.release();
 *
 * @internal Shared by `@nuxvel/cli` and the test global setup.
 */
export async function cachedBuild({
  cacheDir,
  rootDir,
  inputs,
  build,
}: {
  cacheDir: string;
  rootDir: string;
  inputs: BuildInputs;
  build: (dir: string, reason: string) => Promise<string[] | undefined>;
}): Promise<CachedBuild | undefined> {
  await mkdir(cacheDir, { recursive: true });
  const last = await lastInputs(cacheDir, rootDir);
  let keyed = withEnv(inputs, last);
  let made: { dir: string; reason: string } | undefined;

  while (!made) {
    const reused = await reuse(cacheDir, rootDir, inputs);
    if (reused) return reused;

    const dir = join(cacheDir, buildKey(keyed));
    const other = await readyInputs(dir);
    if (other) {
      keyed = withEnv(keyed, other);
      continue;
    }

    const lock = `${dir}${LOCK}`;
    if (!(await takeLock(lock))) {
      await sleep(250);
      continue;
    }

    try {
      const builtMeanwhile = await reuse(cacheDir, rootDir, inputs);
      if (builtMeanwhile) return builtMeanwhile;
      if (await readyInputs(dir)) continue;

      const reason = rebuildReason(keyed, last);
      await rm(dir, { recursive: true, force: true });
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, "root"), rootDir);

      const read = await build(dir, reason);
      if (!read) {
        await rm(dir, { recursive: true, force: true });
        return undefined;
      }
      await writeFile(join(dir, INPUTS), JSON.stringify({ ...inputs, ...envInputs(read) }));
      await writeFile(join(dir, READY), "");
      made = { dir, reason };
    } finally {
      await rm(lock, { recursive: true, force: true });
    }
  }

  const built = await acquire(made.dir);
  if (!built) throw new Error(`The build in ${made.dir} disappeared before it could start`);

  await prune(cacheDir, rootDir);

  return { ...made, built: true, ...built };
}
