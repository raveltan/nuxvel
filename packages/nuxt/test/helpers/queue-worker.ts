import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const PLAYGROUND = fileURLToPath(new URL("../../../../playground", import.meta.url));
const CLI = fileURLToPath(new URL("../../../cli/bin/nuxvel.mjs", import.meta.url));
const STARTUP_TIMEOUT_MS = 60_000;

export async function startQueueWorker(env: Record<string, string> = {}) {
  // these differ per test file, and the CLI keys its server build cache by the environment
  const { VITEST_POOL_ID: _pool, VITEST_WORKER_ID: _worker, ...sharedEnv } = process.env;
  const worker = spawn("node", [CLI, "queue:work"], {
    cwd: PLAYGROUND,
    env: { ...sharedEnv, PLAYGROUND_TEST_PROBES: "1", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`queue worker did not start:\n${output}`)),
      STARTUP_TIMEOUT_MS,
    );
    const collect = (chunk: Buffer) => {
      output += String(chunk);
      if (output.includes("worker listening on queue")) {
        clearTimeout(timer);
        resolve();
      }
    };

    worker.stdout.on("data", collect);
    worker.stderr.on("data", collect);
    worker.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`queue worker exited with ${code}:\n${output}`));
    });
  });

  return {
    output: () => output,
    stop: () =>
      new Promise<void>((resolve) => {
        if (worker.exitCode !== null) return resolve();
        worker.once("exit", () => resolve());
        worker.kill("SIGTERM");
      }),
  };
}
