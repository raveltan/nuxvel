import type { JobsOptions } from "bullmq";
import { type QueuedJob, effectReplacement } from "../effects/replacements";
import { fromJobPayload } from "./payload";
import { useQueue } from "./queue";
import { findJob } from "./registry";

function definedOptions(job: QueuedJob): JobsOptions {
  const definition = findJob(job.name);
  const options: JobsOptions = {};

  if (definition?.attempts !== undefined) options.attempts = definition.attempts;
  if (definition?.backoff !== undefined) options.backoff = definition.backoff;
  if (definition?.unique) {
    options.deduplication = { id: `${job.name}:${definition.unique(fromJobPayload(job.payload).payload)}` };
  }

  return options;
}

/**
 * Puts one relayed `outbox` row on its job's queue, with its delay and
 * priority and the `attempts`, `backoff` and `unique` of its
 * {@link defineJob}.
 *
 * {@link relayOutbox} is the only caller —
 * an app dispatches with {@link Job.dispatch} instead. Under the
 * test harness the `enqueue` replacement records the job instead of
 * reaching Redis.
 */
export async function enqueueJob(job: QueuedJob) {
  const replacement = effectReplacement("enqueue");

  if (replacement) replacement(job);
  else await useQueue(job.queue).add(job.name, job.payload, { ...definedOptions(job), ...job.options });
}
