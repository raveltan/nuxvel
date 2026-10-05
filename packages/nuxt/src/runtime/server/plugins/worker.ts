import { defineNitroPlugin } from "nitropack/runtime";
import { useLogger } from "../logging/logger";
import { DEFAULT_WORKER_CONCURRENCY, ROLE_ENV, WORKER_CONCURRENCY_ENV, WORKER_QUEUES_ENV } from "../worker/role";
import { startWorker } from "../worker/start-worker";
import { errorMessage } from "../errors/error-message";

export default defineNitroPlugin((nitroApp) => {
  if (process.env[ROLE_ENV] !== "worker") return;

  const concurrency = Number(process.env[WORKER_CONCURRENCY_ENV]) || DEFAULT_WORKER_CONCURRENCY;
  const queues = process.env[WORKER_QUEUES_ENV]?.split(",").map((queue) => queue.trim()).filter(Boolean);
  let started: Promise<(() => Promise<void>) | undefined> | undefined;
  let stopping: Promise<void> | undefined;

  const stop = () => {
    stopping ??= started?.then((stopWorker) => stopWorker?.()) ?? Promise.resolve();
    return stopping;
  };

  nitroApp.hooks.hook("close", stop);

  // nitro runs its plugins one after another while it boots; the worker starts once every plugin has
  setImmediate(() => {
    if (stopping) return;

    started = startWorker(concurrency, queues?.length ? queues : undefined).catch((error: unknown) => {
      useLogger("job").error(`the worker could not start: ${errorMessage(error)}`, error);
      if (!import.meta.dev) process.exit(1);
      return undefined;
    });
  });
});
