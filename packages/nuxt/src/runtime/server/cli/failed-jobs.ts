import { writeFile } from "node:fs/promises";
import { queueNames, useQueue } from "../jobs/queue";
import { CommandError, commandSuccess } from "./command-error";
import type { FailedJobsListing } from "./failed-jobs-listing";

async function failedJobs(queues: string[]) {
  const failed = await Promise.all(
    queues.map(async (queue) => (await useQueue(queue).getFailed()).map((job) => ({ queue, job }))),
  );

  return failed.flat();
}

export async function runQueueFailed(outFile: string): Promise<number> {
  const listing: FailedJobsListing = {
    jobs: (await failedJobs(queueNames())).map(({ queue, job }) => ({
      queue,
      id: String(job.id),
      name: job.name,
      attempts: job.attemptsMade,
      failedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
      reason: job.failedReason ?? "",
    })),
  };

  await writeFile(outFile, JSON.stringify(listing));

  return 0;
}

export async function runQueueRetry(target: string, queue: string | undefined): Promise<number> {
  const jobs = await failedJobs(queue ? [queue] : queueNames());
  const retrying = target === "all" ? jobs : jobs.filter(({ job }) => String(job.id) === target);

  if (retrying.length === 0) {
    const message = target === "all" ? "No failed jobs to retry" : `No failed job has the id ${target}`;

    throw new CommandError(message, { hint: "Run nuxvel queue:failed to list the failed jobs" });
  }

  if (target !== "all" && retrying.length > 1) {
    throw new CommandError(
      `More than one queue has a failed job with the id ${target}: ${retrying.map((entry) => entry.queue).join(", ")}`,
      { hint: `Pass --queue, e.g. nuxvel queue:retry ${target} --queue ${retrying[0]?.queue}` },
    );
  }

  for (const { job } of retrying) await job.retry();

  commandSuccess(`Re-enqueued ${retrying.length} job(s): ${retrying.map(({ job }) => String(job.id)).join(", ")}`);
  return 0;
}
