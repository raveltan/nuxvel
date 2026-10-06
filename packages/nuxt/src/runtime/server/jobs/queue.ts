import { Queue } from "bullmq";
import { useRedis } from "../redis/client";
import { redisKey } from "../redis/key";
import { allJobs } from "./registry";

const QUEUE_NAME = "nuxvel";

/**
 * The default options of every job: three attempts, backing off
 * exponentially from a second, then the failed set. A completed job is
 * removed after an hour or when 1000 newer jobs complete on its queue. A
 * failed job is removed after 7 days. The `attempts` and `backoff` of a
 * {@link defineJob} replace the retry policy.
 */
export const JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential", delay: 1000 },
  removeOnComplete: { age: 3600, count: 1000 },
  removeOnFail: { age: 7 * 86400 },
} as const;

const queues = new Map<string, Queue>();

/** The BullMQ name of a {@link defineJob} `queue`: `nuxvel` for `default`, `nuxvel-<queue>` for the others. */
export function bullQueueName(queue: string) {
  return queue === "default" ? QUEUE_NAME : `${QUEUE_NAME}-${queue}`;
}

export function bullPrefix() {
  return redisKey("bull");
}

/** Every queue a job uses: `default` first, then each `queue` option of a {@link defineJob}, sorted. */
export function queueNames(): string[] {
  const named = new Set(allJobs().map((job) => job.queue));

  named.delete("default");

  return ["default", ...[...named].sort()];
}

/**
 * One of the app's BullMQ queues, created once and reused.
 *
 * Auto-imported on the server. Prefer {@link Job.dispatch} for
 * dispatching work — reach for this only to inspect or manage a queue
 * itself. Jobs added through it carry {@link JOB_OPTIONS}.
 *
 * @param name A {@link defineJob} `queue`. Defaults to `default`, the
 * queue of every job without one, which BullMQ knows as `nuxvel`.
 * Another queue is `nuxvel-<name>` in BullMQ.
 *
 * @example
 * ```ts
 * const failed = await useQueue().getFailed();
 * const waitingMail = await useQueue("mail").getWaiting();
 * ```
 */
export function useQueue(name = "default"): Queue {
  let queue = queues.get(name);

  if (!queue) {
    queue = new Queue(bullQueueName(name), {
      connection: useRedis("queue"),
      prefix: bullPrefix(),
      defaultJobOptions: JOB_OPTIONS,
    });
    queues.set(name, queue);
  }

  return queue;
}

export async function closeQueue() {
  const closing = [...queues.values()];

  queues.clear();
  await Promise.all(closing.map((queue) => queue.close()));
}
