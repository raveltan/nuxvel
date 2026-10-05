import type { z } from "zod";
import { beforeEach } from "vitest";
import type { Job } from "../../runtime/server/jobs/define-job";
import type { JobInput, JobName } from "../../runtime/server/jobs/registry";
import { postToControlChannel } from "../control-channel";
import { recordedEffects } from "../recorded";
import { expectNotRecorded, expectRecorded, includes } from "./records";

/**
 * Asserts that a job, by its name or its definition, reached the queue
 * during the test, carrying a payload whose fields include `match`.
 *
 * In a test build the app relays to a recorder instead of Redis. The
 * outbox is relayed before the assertion, so a job
 * {@link dispatchAfterCommit} wrote is visible without `nuxvel
 * queue:work` running. Use {@link expectMailSent} for mail and
 * {@link dispatch} to assert on the dispatch itself.
 *
 * @param name A {@link JobName}, or the job's definition; a name no job
 * defines fails to compile.
 * @param match Payload fields the queued job must carry, typed by the
 * job's input; defaults to matching any payload.
 * @param options.times How many matching jobs there must be, 1 or more.
 * @returns The payload of the latest matching job.
 *
 * @example
 * ```ts
 * const { postId } = await expectQueued($jobs.post.notifySubscribers, { postId: post.id });
 * ```
 */
export async function expectQueued<Name extends JobName>(
  name: Name,
  match?: Partial<JobInput<Name>>,
  options?: { times?: number },
): Promise<JobInput<Name>>;
export async function expectQueued<Schema extends z.ZodType>(
  job: Job<string, Schema>,
  match?: Partial<z.input<Schema>>,
  options?: { times?: number },
): Promise<z.input<Schema>>;
export async function expectQueued(nameOrJob: string | Job, match?: object, options: { times?: number } = {}) {
  const name = typeof nameOrJob === "string" ? nameOrJob : nameOrJob.name;
  const { queued } = await recordedEffects();
  const matchesPayload = includes(match);

  return expectRecorded(
    "expectQueued",
    `a queued "${name}" job with ${JSON.stringify(match ?? {})}`,
    queued,
    (job) => job.name === name && matchesPayload(job.payload),
    options.times,
  ).payload;
}

/**
 * Asserts that a job, by its name or its definition, did not reach the
 * queue during the test with a payload whose fields include `match`.
 * Without `match`, any queued run of that job fails it.
 *
 * Relays the outbox first, like {@link expectQueued}.
 *
 * @param match Payload fields typed by the job's input.
 *
 * @example
 * ```ts
 * await expectNotQueued($jobs.post.notifySubscribers);
 * await expectNotQueued("post.notify-subscribers", { postId: draft.id });
 * ```
 */
export async function expectNotQueued<Name extends JobName>(name: Name, match?: Partial<JobInput<Name>>): Promise<void>;
export async function expectNotQueued<Schema extends z.ZodType>(
  job: Job<string, Schema>,
  match?: Partial<z.input<Schema>>,
): Promise<void>;
export async function expectNotQueued(nameOrJob: string | Job, match?: object) {
  const name = typeof nameOrJob === "string" ? nameOrJob : nameOrJob.name;
  const { queued } = await recordedEffects();
  const matchesPayload = includes(match);

  expectNotRecorded(
    "expectNotQueued",
    `a queued "${name}" job with ${JSON.stringify(match ?? {})}`,
    queued,
    (job) => job.name === name && matchesPayload(job.payload),
  );
}

/**
 * Opts this test file out of the queue fake: relays add jobs to the real
 * BullMQ queue, as in production.
 *
 * Call it in the `describe` body, for a test that
 * inspects the queue itself — {@link expectQueued} records nothing once
 * you do. Re-applied before every test in the file, so a `startServer()`
 * restart does not quietly put the fake back.
 *
 * @example
 * ```ts
 * describe("the outbox", () => {
 *   useRealQueue();
 * });
 * ```
 */
export function useRealQueue() {
  beforeEach(async () => {
    await postToControlChannel("real-queue");
  });
}
