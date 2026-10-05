import { z } from "zod";
import type { Actor } from "../actions/system-actor";
import type { Job } from "../jobs/define-job";
import { queueAfterCommit } from "../jobs/outbox/queue-after-commit";
import { type JobInput, type JobName, findJob } from "../jobs/registry";
import { ambientActor } from "./use-auth";

/**
 * When, in what order and as whom a dispatched job runs: the third
 * argument of {@link dispatchAfterCommit}. `delay` and `priority` are
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

/**
 * Queues a {@link defineJob} job, by its name or its definition, to run once the
 * surrounding transaction commits, so nothing fires for a rolled-back
 * write.
 *
 * Auto-imported on the server. A row is written to the `outbox` table
 * inside the same transaction, holding the payload under the job's
 * current version, with a `NOTIFY` on `nuxvel_outbox` that Postgres
 * delivers at the commit; {@link relayOutbox} — which `nuxvel queue:work`
 * runs on that notification and every second — adds it to the BullMQ
 * queue and marks it dispatched. So a
 * crash between the commit and the enqueue loses nothing, and a rollback
 * leaves no row behind. The first argument is a {@link JobName} or the
 * job's definition (`$jobs.post.notifyFollowers` or an import), and
 * `payload` that job's input, so a misspelled name or a wrong payload
 * fails to compile; an unknown name still throws at runtime, and so do
 * options out of range. Tests assert on it with {@link expectQueued}.
 *
 * Outside a transaction the outbox row is written straight away, and the
 * returned promise settles once it is; inside one it settles at once.
 *
 * @param options.delay Milliseconds the job waits on the queue before it
 * can run. See {@link DispatchOptions}.
 * @param options.priority BullMQ priority, 1 runs first. See
 * {@link DispatchOptions}.
 * @param options.dispatcher The {@link Actor} the job runs as, so
 * {@link useAuth} in the handler returns it. The current actor when
 * unset; `null` runs the job as nobody.
 *
 * @example
 * ```ts
 * await dispatchAfterCommit("post.notify-followers", { postId: post.id });
 * await dispatchAfterCommit($jobs.post.notifyFollowers, { postId: post.id });
 * await dispatchAfterCommit("post.send-digest", { postId: post.id }, { delay: 60_000, priority: 10 });
 * await dispatchAfterCommit("post.reindex", { postId: post.id }, { dispatcher: systemActor("reindex") });
 * ```
 */
export async function dispatchAfterCommit<Name extends JobName>(
  name: Name,
  payload: JobInput<Name>,
  options?: DispatchOptions,
): Promise<void>;
export async function dispatchAfterCommit<Schema extends z.ZodType>(
  job: Job<string, Schema>,
  payload: z.input<Schema>,
  options?: DispatchOptions,
): Promise<void>;
export async function dispatchAfterCommit(
  nameOrJob: string | Job,
  payload: unknown,
  options: DispatchOptions = {},
): Promise<void> {
  const name = typeof nameOrJob === "string" ? nameOrJob : nameOrJob.name;
  const job = findJob(name);

  if (!job) throw new Error(`No job is named "${name}"`);

  const dispatcher = options.dispatcher === undefined ? await ambientActor() : options.dispatcher;

  await queueAfterCommit(name, job.version, payload, dispatchOptions.parse(options), dispatcher);
}
