import type { z } from "zod";
import jobs from "#nuxvel/jobs";
import { type Defined, aliasesIn, definitionsIn, resolveName } from "../discovery/aliases";
import type { Renamed } from "../discovery/renamed";
import type { Job, JobChannel } from "./define-job";

type Discovered = Defined<(typeof jobs)[number]>;

/**
 * The name of every job defined under `server/jobs/`, the built-in
 * `nuxvel.mail` and `nuxvel.notification` included: what {@link Job.dispatch} and
 * {@link runJob} take.
 */
export type JobName = Discovered["name"];

/**
 * What the job named `Name` is dispatched with: its `input` schema's
 * input type, before any transform runs.
 */
export type JobInput<Name extends JobName> = z.input<Extract<Discovered, Job<Name>>["input"]>;

/** The name of every job whose `defineJob` has a `channel`: what `useJobChannel` takes. */
export type JobChannelName = Extract<Discovered, { channel: JobChannel }>["name"];

type JobResult<Name extends JobName> =
  Extract<Discovered, Job<Name>> extends Job<Name, z.ZodType, infer Result> ? Result : never;

/**
 * What the job named `Name` broadcasts on its channel: each
 * `reportProgress`, then `completed` with the handler's return value (or
 * `null`), or `failed` with a safe message: a taxonomy error's own message,
 * else "Something went wrong".
 */
export type JobMessage<Name extends JobName> = JobResultMessage<JobResult<Name>>;

/** What a job whose handler returns `Result` broadcasts on its channel; see {@link JobMessage}. */
export type JobResultMessage<Result> =
  | { event: "progress"; payload: { percent: number } }
  | { event: "completed"; payload: { result: [Result] extends [void | undefined] ? null : Result } }
  | { event: "failed"; payload: { message: string } };

function entries(): readonly (Job | Renamed<Job>)[] {
  return jobs;
}

/**
 * Every job discovered under `server/jobs/`.
 *
 * `nuxvel queue:work` uses it to decide
 * which handlers it can run.
 */
export function allJobs(): readonly Job[] {
  return definitionsIn(entries());
}

/**
 * Every {@link renamed} alias under `server/jobs/`: an old job name and
 * the job it now runs.
 *
 * `nuxvel queue:work` runs a job still queued under the old name with
 * the job it points at.
 */
export function jobAliases(): readonly Renamed<Job>[] {
  return aliasesIn(entries());
}

/**
 * The discovered job with this dispatch name, or with an old name a
 * {@link renamed} alias keeps, or `undefined` when no file defines one.
 *
 * {@link Job.dispatch} uses it to
 * tell a real job from a name with no handler behind it yet.
 */
export function findJob(name: string): Job | undefined {
  return resolveName(entries(), name);
}
