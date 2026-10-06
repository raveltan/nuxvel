import type { z } from "zod";
import type { Job } from "../runtime/server/jobs/define-job";
import type { JobInput, JobName } from "../runtime/server/jobs/registry";
import { callApp } from "./settled";

/**
 * Runs a {@link defineJob} handler, by its name or its definition, in
 * the app under test, here and now, with `input` in its current
 * version's shape.
 *
 * Nothing is queued and no `nuxvel queue:work` process is involved, so
 * the handler's effect is there when the call resolves. `input` is
 * validated like a real dispatch, rejecting with the same
 * `BAD_REQUEST` validation error; a handler that throws rejects with its
 * error. A {@link Job.dispatch} the handler makes runs with no
 * transaction in scope, as under `queue:work`, so {@link expectQueued}
 * sees the follow-up job.
 *
 * @param name A {@link JobName}, or the job's definition or its stub from
 * `#nuxvel/test-namespaces`; a name no job defines fails to compile.
 * @param input The job's input, before its schema parses it.
 * @param options.actingAs The user the job runs as: its dispatcher is
 * built from their row, as for a dispatch by that user. Without it the
 * job runs as nobody.
 *
 * @example
 * ```ts
 * import { $jobs } from "#nuxvel/test-namespaces";
 *
 * await runJob($jobs.post.notifySubscribers, { postId: post.id });
 * await runJob("post.notify-subscribers", { postId: post.id });
 * await runJob("post.import", { fileId }, { actingAs: author });
 * await expectRow(notificationsTable, { postId: post.id });
 * ```
 */
export async function runJob<Name extends JobName>(
  name: Name,
  input: JobInput<Name>,
  options?: { actingAs?: { id: string } },
): Promise<void>;
export async function runJob<Schema extends z.ZodType>(
  job: Job<string, Schema>,
  input: z.input<Schema>,
  options?: { actingAs?: { id: string } },
): Promise<void>;
export async function runJob(
  nameOrJob: string | Job,
  input: unknown,
  options: { actingAs?: { id: string } } = {},
): Promise<void> {
  await callApp("run-job", {
    name: typeof nameOrJob === "string" ? nameOrJob : nameOrJob.name,
    input,
    userId: options.actingAs?.id,
  });
}
