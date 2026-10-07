import { callApp } from "./settled";

/**
 * Runs every job and queued listener that waits in the queue fake, in the app under test, until the queue is empty.
 *
 * The outbox is relayed before each run, so a job that a run dispatches also runs.
 * Jobs run in queue order, with the dispatcher that queued them.
 * The `nuxvel.mail` job does not run: assert the send with {@link expectMailSent}.
 * A job that throws rejects the call with its error and leaves the rest of the queue.
 * Delays are ignored. The records of {@link expectQueued} stay.
 * Use {@link runJob} or {@link runListener} to run one handler.
 *
 * @example
 * ```ts
 * await actingAs(author).api.post.publish({ id: post.id });
 * await workQueue();
 * await expectMailSent("post.published", { to: follower.email });
 * ```
 */
export async function workQueue(): Promise<void> {
  await callApp("work-queue", {});
}
