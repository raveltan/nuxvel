import { mkdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import { buildNuxt, loadNuxt, loadNuxtConfig, logger } from "@nuxt/kit";
import { buildInputs } from "../build-cache/build-key";
import { cachedBuild } from "../build-cache/cached-build";
import { recordEnvReads } from "../build-cache/env-reads";

/** Options for {@link cachedTestBuild}. */
export interface TestBuildOptions {
  /** Loads the app's `.env` into `process.env` before the build. Defaults to `true`. */
  dotenv?: boolean;
  /** Extra layers the build extends, on top of the app's own `extends`. */
  layers?: string[];
}

async function build(rootDir: string, buildDir: string, { layers }: TestBuildOptions) {
  const nuxt = await loadNuxt({
    cwd: rootDir,
    dev: false,
    // testBuildInputs loaded .env already, and a second merge would read every variable while recordEnvReads watches
    dotenv: false,
    overrides: {
      test: true,
      extends: layers,
      buildDir,
      nitro: {
        output: { dir: join(buildDir, "output") },
        externals: { trace: false },
        experimental: { sourcemapMinify: false },
      },
    },
  });
  const level = logger.level;
  logger.level = 1;

  try {
    await buildNuxt(nuxt);
  } finally {
    // nuxt's builders leave console and stdout wrapped by consola, which swallows vitest's reporter
    logger.restoreAll();
    logger.level = level;
    await nuxt.close();
  }
}

/**
 * Hashes the inputs of the test build of the app at `rootDir`, as {@link cachedTestBuild} does.
 *
 * @internal Exported for the framework's own tests.
 */
export async function testBuildInputs(rootDir: string, { dotenv, layers }: TestBuildOptions = {}) {
  const config = await loadNuxtConfig({ cwd: rootDir, dotenv, overrides: { test: true, extends: layers } });

  return buildInputs(config, { client: true, recipe: "test untraced full-sourcemaps" });
}

/**
 * Builds the app at `rootDir` for tests, or uses the cached build while the app's inputs do not change.
 *
 * The build stays in `node_modules/.cache/nuxvel/test/<key>/build` of the app and prints
 * `◇ Using the test build from <date>` or `◇ Built the app for tests: <file> changed (<s>)` on stderr.
 * Call `release` when the run ends, so that a later build can remove this one.
 * Throws the build error when the build fails.
 *
 * @example
 * const { buildDir, release } = await cachedTestBuild(rootDir, { dotenv: false });
 *
 * @internal Shared by `@nuxvel/nuxt/testing/global-setup` and the framework's own test setup.
 */
export async function cachedTestBuild(rootDir: string, options: TestBuildOptions = {}) {
  const inputs = await testBuildInputs(rootDir, options);
  const linkedCacheDir = join(rootDir, "node_modules", ".cache", "nuxvel", "test");
  await mkdir(linkedCacheDir, { recursive: true });
  const startedAt = performance.now();
  let failure: unknown;

  const cached = await cachedBuild({
    // nitro inlines the build dir by its real path, so a symlinked node_modules would leave it external
    cacheDir: await realpath(linkedCacheDir),
    rootDir,
    inputs,
    build: (dir) =>
      recordEnvReads(() => build(rootDir, join(dir, "build"), options)).catch((error: unknown) => {
        failure = error;
        return undefined;
      }),
  });

  if (!cached) throw failure;

  const seconds = ((performance.now() - startedAt) / 1000).toFixed(1);
  process.stderr.write(
    cached.built
      ? `◇ Built the app for tests: ${cached.reason} (${seconds}s)\n`
      : `◇ Using the test build from ${cached.builtAt.toLocaleString()}\n`,
  );

  return { buildDir: join(cached.dir, "build"), release: cached.release };
}
