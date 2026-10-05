import { userActor } from "../actions/user-actor";
import { toJobPayload } from "../jobs/payload";
import { findJob } from "../jobs/registry";
import { isRetryableJobError } from "../jobs/retryable";
import { releaseUniqueKey } from "./queued-jobs";
import { sessionUser } from "./session-user";

export async function runJob(name: string, input: unknown, userId?: string) {
  const job = findJob(name);

  if (!job) throw new Error(`No job is named "${name}"`);

  const dispatcher = userId === undefined ? null : userActor(await sessionUser(userId));

  releaseUniqueKey({ queue: "", name, payload: toJobPayload(job.version, input, dispatcher), options: {} });

  try {
    await job.run(toJobPayload(job.version, input, dispatcher));
  } catch (error) {
    throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
      retryable: isRetryableJobError(error),
    });
  }
}
