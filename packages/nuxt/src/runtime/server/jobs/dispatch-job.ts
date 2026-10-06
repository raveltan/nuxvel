import { z } from "zod";
import type { Actor } from "../actions/system-actor";
import { ambientActor } from "../utils/use-auth";
import type { Job } from "./define-job";
import { queueAfterCommit } from "./outbox/queue-after-commit";
import { findJob } from "./registry";

/**
 * When, in what order and as whom a dispatched job runs: the second
 * argument of {@link Job.dispatch}. `delay` and `priority` are
 * BullMQ's own job options, stored on the `outbox` row until the relay.
 */
export interface DispatchOptions {
  /**
   * Milliseconds the job waits in BullMQ's delayed set before a worker
   * can run it. The wait starts when the relay adds the job to the
   * queue. A whole number from 0 to 2147483647 (about 24 days).
   */
  delay?: number;
  /**
   * BullMQ priority, a whole number from 1 (runs first) to 2097152. A
   * job with no priority runs before every job that has one.
   */
  priority?: number;
  /**
   * The {@link Actor} the job runs as, `null` for none. When unset, the
   * current actor: the one the running action or procedure set, else
   * the request's API key or session.
   */
  dispatcher?: Actor | null;
}

const dispatchOptions = z.object({
  delay: z.number().int().min(0).max(2_147_483_647).optional(),
  priority: z.number().int().min(1).max(2_097_152).optional(),
});

export async function dispatchJob(nameOrJob: string | Job, payload: unknown, options: DispatchOptions = {}): Promise<void> {
  const name = typeof nameOrJob === "string" ? nameOrJob : nameOrJob.name;
  const job = findJob(name);

  if (!job) throw new Error(`No job is named "${name}"`);

  const dispatcher = options.dispatcher === undefined ? await ambientActor() : options.dispatcher;

  await queueAfterCommit(name, job.version, payload, dispatchOptions.parse(options), dispatcher);
}
