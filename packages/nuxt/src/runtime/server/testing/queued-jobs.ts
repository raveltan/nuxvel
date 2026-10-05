import type { QueuedJob } from "../effects/replacements";
import { fromJobPayload } from "../jobs/payload";
import { findJob } from "../jobs/registry";

const pending: QueuedJob[] = [];
const uniqueKeys = new Set<string>();

function uniqueKey(job: QueuedJob) {
  const unique = findJob(job.name)?.unique;

  return unique ? `${job.name}:${unique(fromJobPayload(job.payload).payload)}` : undefined;
}

export function holdQueuedJob(job: QueuedJob) {
  const key = uniqueKey(job);

  if (key !== undefined) {
    if (uniqueKeys.has(key)) return false;
    uniqueKeys.add(key);
  }

  pending.push(job);

  return true;
}

export function takeQueuedJob() {
  const job = pending.shift();

  if (job) releaseUniqueKey(job);

  return job;
}

export function releaseUniqueKey(job: QueuedJob) {
  const key = uniqueKey(job);

  if (key !== undefined) uniqueKeys.delete(key);
}

export function dropQueuedJobs() {
  pending.length = 0;
  uniqueKeys.clear();
}
