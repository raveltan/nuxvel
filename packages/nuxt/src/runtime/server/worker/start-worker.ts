import { type Job, UnrecoverableError, Worker } from "bullmq";
import { flushErrorTracking, reportError } from "../error-tracking/sentry";
import { allListeners } from "../events/registry";
import { rootPool } from "../database/connection/pool";
import { relayOutbox } from "../jobs/outbox-relay";
import { OUTBOX_CHANNEL } from "../jobs/outbox/queue-after-commit";
import { bullPrefix, bullQueueName, queueNames } from "../jobs/queue";
import { allJobs } from "../jobs/registry";
import { isReportedJobError, isRetryableJobError } from "../jobs/retryable";
import { classifyError } from "../errors/classify";
import { allSchedules, registerSchedules } from "../jobs/schedule-registry";
import { observeRun } from "../observe/channels";
import { useLogger } from "../logging/logger";
import { useRedis } from "../redis/client";
import { handlersByName } from "./job-handlers";
import { errorMessage } from "../errors/error-message";

const RELAY_INTERVAL_MS = 1000;
const FLUSH_TIMEOUT_MS = 2000;

function outboxRelay() {
  let relaying = false;
  let again = false;

  return async () => {
    if (relaying) {
      again = true;
      return;
    }

    relaying = true;

    try {
      do {
        again = false;

        try {
          await relayOutbox();
        } catch (error) {
          useLogger("outbox").error("outbox relay failed", error);
        }
      } while (again);
    } finally {
      relaying = false;
    }
  };
}

async function listenForOutbox(relay: () => Promise<void>) {
  try {
    return await rootPool().$client.listen(OUTBOX_CHANNEL, () => void relay());
  } catch (error) {
    useLogger("outbox").warn(`could not listen on ${OUTBOX_CHANNEL}, relaying on the timer only`, error);
    return undefined;
  }
}

function counted(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function listenedQueues(requested: string[] | undefined) {
  const known = queueNames();

  if (!requested) return known;

  for (const name of requested) {
    if (!known.includes(name)) {
      throw new Error(`nuxvel queue:work: no job uses the queue "${name}". Known queues: ${known.join(", ")}`);
    }
  }

  return requested;
}

function queueLimiter(queue: string) {
  const limiters = allJobs().flatMap((job) => (job.queue === queue && job.limiter ? [job.limiter] : []));
  const [limiter] = limiters;

  if (limiters.some((other) => JSON.stringify(other) !== JSON.stringify(limiter))) {
    throw new Error(`nuxvel queue:work: the jobs of the queue "${queue}" set different limiters`);
  }

  return limiter;
}

export async function startWorker(concurrency: number, requestedQueues?: string[]): Promise<() => Promise<void>> {
  const log = useLogger("job");
  const byName = handlersByName();
  const names = listenedQueues(requestedQueues);
  const limiters = new Map(names.map((name) => [name, queueLimiter(name)]));

  await registerSchedules();

  const handle = async (job: Job) => {
    const startedAt = performance.now();
    const attempt = job.attemptsMade + 1;
    const attempts = Math.max(job.opts.attempts ?? 1, 1);
    const fields = () => ({ jobId: job.id, name: job.name, attempt, durationMs: performance.now() - startedAt });

    await observeRun({ id: `job:${job.id}`, kind: "job", label: job.name }, async () => {
      try {
        const run = byName.get(job.name);

        if (!run) throw new UnrecoverableError(`No job defines "${job.name}"`);

        await run(job.data, { last: attempt >= attempts });
        log.info(`${job.name} #${job.id} done`, fields());
      } catch (thrown) {
        const error = classifyError(thrown) ?? thrown;
        const retrying = isRetryableJobError(error) && attempt < attempts;

        if (isReportedJobError(error, retrying)) reportError(error, { job: job.name });

        if (retrying) log.warn(`${job.name} #${job.id} failed, retrying (attempt ${attempt}/${attempts})`, fields(), error);
        else log.error(`${job.name} #${job.id} failed (attempt ${attempt}/${attempts})`, fields(), error);

        if (isRetryableJobError(error)) throw error;

        throw new UnrecoverableError(errorMessage(error));
      }
    });
  };
  const workers = names.map((name) => {
    const connection = useRedis("queue").duplicate();

    return { connection, worker: new Worker(bullQueueName(name), handle, { connection, prefix: bullPrefix(), concurrency, limiter: limiters.get(name) }) };
  });
  const relay = outboxRelay();
  const relayTimer = setInterval(relay, RELAY_INTERVAL_MS);
  const listening = await listenForOutbox(relay);

  const counts = {
    jobs: allJobs().length,
    listeners: allListeners().filter((listener) => !listener.sync).length,
    schedules: allSchedules().length,
  };

  log.info(
    `worker listening on ${names.length === 1 ? "queue" : "queues"} ${names.map((name) => `"${name}"`).join(", ")}: ${counted(counts.jobs, "job")}, ${counted(counts.listeners, "queued listener")}, ${counted(counts.schedules, "schedule")}, concurrency ${concurrency}, outbox relayed on commit and every ${RELAY_INTERVAL_MS / 1000}s`,
    { queues: names, ...counts, concurrency },
  );

  return async () => {
    clearInterval(relayTimer);
    await listening?.unlisten();
    await Promise.all(workers.map(({ worker }) => worker.close()));
    await Promise.all(workers.map(({ connection }) => connection.quit()));
    await flushErrorTracking(FLUSH_TIMEOUT_MS);
  };
}
