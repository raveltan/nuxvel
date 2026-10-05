import { spawn } from "node:child_process";
import { mkdir, readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { loadNuxtConfig } from "@nuxt/kit";
import {
  buildInputs,
  cachedBuild,
  COMMAND_ENV,
  type NuxvelCommand,
  ROLE_ENV,
  WORKER_CONCURRENCY_ENV,
  WORKER_QUEUES_ENV,
} from "@nuxvel/nuxt/cli";
import { checkEnvironment, environmentSettings } from "@nuxvel/nuxt/env";
import pkg from "../../package.json" with { type: "json" };
import { loadEnvFile } from "../env/load-env-file.ts";
import { error, report, style, symbols } from "../ui/output.ts";
import { buildAppServer } from "./build-app-server.ts";

async function appServerBuild(options: Awaited<ReturnType<typeof loadNuxtConfig>>) {
  const linkedCacheDir = join(options.rootDir, "node_modules", ".cache", "nuxvel", "server");
  await mkdir(linkedCacheDir, { recursive: true });
  // the build's source maps hold paths relative to this dir, and Node resolves them from its real path
  const cacheDir = await realpath(linkedCacheDir);
  const entry = await readFile(join(import.meta.dirname, "build-entry.ts"), "utf8");
  const inputs = await buildInputs(options, { client: false, recipe: `cli ${pkg.version}\0${entry}` });
  const build = await cachedBuild({
    cacheDir,
    rootDir: options.rootDir,
    inputs,
    build: (dir, reason) => buildAppServer(options.rootDir, dir, reason),
  });

  if (build && !build.built) report(`${symbols.step} Using the server build from ${style.dim(build.builtAt.toLocaleString())}`);
  return build;
}

function startServer(cwd: string, entry: string, env: Record<string, string>): Promise<number> {
  const child = spawn(process.execPath, [entry], {
    cwd,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });

  const ignoreInterrupt = () => {};
  const forwardTerminate = () => child.kill("SIGTERM");
  process.on("SIGINT", ignoreInterrupt);
  process.on("SIGTERM", forwardTerminate);

  return new Promise((resolve) => {
    child.on("error", (failure) => {
      error(`Could not start the app's server: ${failure.message}`);
      resolve(1);
    });
    child.on("exit", (code) => {
      process.off("SIGINT", ignoreInterrupt);
      process.off("SIGTERM", forwardTerminate);
      resolve(code ?? 1);
    });
  });
}

async function runInApp(cwd: string, env: Record<string, string>): Promise<number> {
  const options = await loadNuxtConfig({ cwd });
  const problems = checkEnvironment(environmentSettings(process.env, options.runtimeConfig));

  for (const { message, hint } of problems) error(message, hint);
  if (problems.length > 0) return 1;

  const build = await appServerBuild(options);

  if (build === undefined) return 1;

  try {
    return await startServer(cwd, join(build.dir, ".output", "server", "index.mjs"), env);
  } finally {
    await build.release();
  }
}

export function runCommandInApp(cwd: string, command: NuxvelCommand) {
  loadEnvFile(cwd);

  return runInApp(cwd, {
    [COMMAND_ENV]: JSON.stringify(command),
    ...(process.env.NUXT_LOG_FORMAT ? {} : { NUXT_LOG_FORMAT: "pretty" }),
  });
}

function workerLogFormat(): Record<string, string> {
  if (process.env.NUXT_LOG_FORMAT || process.env.NODE_ENV === "production") return {};

  return { NUXT_LOG_FORMAT: "pretty" };
}

export function runWorkerInApp(cwd: string, concurrency: number, queues: string | undefined) {
  loadEnvFile(cwd);

  return runInApp(cwd, {
    [ROLE_ENV]: "worker",
    [WORKER_CONCURRENCY_ENV]: String(concurrency),
    ...(queues ? { [WORKER_QUEUES_ENV]: queues } : {}),
    ...workerLogFormat(),
  });
}
