import { settleAfterResponse } from "../auth/after-response";
import { relayOutbox } from "../jobs/outbox-relay";
import { MAIL_JOB_NAME } from "../mail/jobs/mail-job-name";
import { handlersByName } from "../worker/job-handlers";
import { takeQueuedJob } from "./queued-jobs";

export async function workQueue() {
  const handlers = handlersByName();

  for (;;) {
    await settleAfterResponse();
    await relayOutbox();

    const job = takeQueuedJob();

    if (!job) return;
    if (job.name === MAIL_JOB_NAME) continue;

    const run = handlers.get(job.name);

    if (!run) throw new Error(`No job defines "${job.name}"`);

    await run(job.payload, { last: true });
  }
}
