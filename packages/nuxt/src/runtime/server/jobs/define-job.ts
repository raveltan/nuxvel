import type { BackoffOptions, RateLimiterOptions } from "bullmq";
import type { z } from "zod";
import { actorContext } from "../actions/context";
import type { Actor } from "../actions/system-actor";
import { jobChannelName } from "../../shared/realtime/job-channel";
import { awaitingName } from "../discovery/definition-name";
import { reportError } from "../error-tracking/sentry";
import { genericErrorMessage } from "../errors/generic-message";
import { ValidationFailedError, isKnownTaxonomyError } from "../errors/taxonomy";
import { useLogger } from "../logging/logger";
import type { ChannelConnection } from "../realtime/define-channel";
import { publishChannelMessage } from "../realtime/streams/publish-message";
import { type Upcaster, fromJobPayload, upcastPayload } from "./payload";
import { isRetryableJobError } from "./retryable";
import { classifyError } from "../errors/classify";

/** Who may follow a job on its channel: the `channel` option of {@link defineJob}. */
export interface JobChannel {
  authorize: (connection: ChannelConnection) => boolean | Promise<boolean>;
}

declare const jobResult: unique symbol;

/**
 * A job definition: its dispatch name, payload version and the validated
 * work it runs. The name is its file's path under `server/jobs/`.
 */
export interface Job<
  Name extends string = string,
  Schema extends z.ZodType = z.ZodType,
  Result = unknown,
> {
  readonly name: Name;
  queue: string;
  version: number;
  upcasters: number[];
  input: Schema;
  channel?: JobChannel;
  attempts?: number;
  backoff?: number | BackoffOptions;
  timeout?: number;
  unique?(payload: unknown): string;
  limiter?: RateLimiterOptions;
  run: (data: unknown, attempt?: JobAttempt) => Promise<void>;
  /** Brands the job with its handler's resolved return type; no such property exists at runtime. */
  readonly [jobResult]?: Result;
}

interface JobConfig<Schema extends z.ZodType, Result> {
  queue?: string;
  version?: number;
  upcasters?: Record<number, JobUpcaster>;
  attempts?: number;
  backoff?: number | BackoffOptions;
  timeout?: number;
  unique?: (payload: z.input<Schema>) => string;
  limiter?: RateLimiterOptions;
  input: Schema;
  handler: (input: z.infer<Schema>, context: JobContext) => Result;
}

/** Which attempt at a queued job a run is, passed to {@link Job.run} by the worker. */
export interface JobAttempt {
  /** No retry follows if this attempt throws. */
  last: boolean;
}

/** Turns a payload written under one version into the next version's shape. */
export type JobUpcaster = Upcaster;

/**
 * What a job's handler is given besides its input, to say how far along
 * it is.
 */
export interface JobContext {
  /**
   * Broadcasts how far along this run is, as a whole percentage, on the
   * run's job channel: `job:<name>:<userId>` when a user dispatched the
   * run, else `job:<name>`. Does nothing for a job without a `channel`.
   */
  reportProgress: (percent: number) => Promise<void>;
  /**
   * The {@link Actor} that dispatched this run, `null` when nobody did.
   * The handler runs as it, so {@link useAuth} returns it and its user.
   */
  dispatcher: Actor | null;
}

/**
 * Defines a background job: one unit of work run outside the request, by
 * the `nuxvel queue:work` process.
 *
 * `defineJob` is auto-imported. One job per file, under `server/jobs/`;
 * the file is discovered, so nothing registers it, and its path is the
 * job's name: `server/jobs/post/notify-subscribers.job.ts` is
 * `"post.notify-subscribers"`, what {@link dispatchAfterCommit} takes and
 * what the queue stores. It becomes part of {@link JobName}, so a
 * dispatch of a misspelled name fails to compile. Moving the file
 * renames the job; {@link renamed} keeps the old name running what was
 * already queued under it.
 *
 * `run` upcasts the queued payload to the current version, then
 * validates it with `input` (async refinements and transforms included)
 * before the handler sees it, throwing the same
 * {@link ValidationFailedError} an action throws. A handler that throws
 * is retried — see {@link JOB_OPTIONS} — and lands in the queue's failed
 * set once its attempts run out, so handlers should be safe to run twice.
 * An invalid payload, or one no upcaster can carry over, fails at once:
 * retrying it could not help.
 *
 * @param config.queue The queue the job goes on, `default` when unset.
 * `nuxvel queue:work --queue mail,default` runs only the listed queues,
 * so slow work on one queue does not hold up another. See
 * {@link useQueue}.
 * @param config.version The version `input` describes, defaulting to 1.
 * Raise it whenever you change the shape of `input`, and add the
 * upcaster that carries the old payloads over.
 * @param config.upcasters Keyed by the version a payload was written
 * under; each one returns that payload in the next version's shape. A
 * queued payload with no upcaster for its version fails the job, and
 * `nuxvel queue:versions` flags it while it is still queued.
 * @param config.attempts The number of attempts before the job goes to
 * the failed set, 3 when unset. BullMQ's `attempts` job option.
 * @param config.backoff The wait between attempts, in milliseconds or as
 * BullMQ's `{ type: "fixed" | "exponential", delay }`. Exponential from
 * one second when unset.
 * @param config.timeout Milliseconds that one attempt can run. An attempt
 * that runs longer fails and retries like a handler that throws. The
 * handler is not stopped. No limit when unset.
 * @param config.unique Returns a key from the dispatched payload. While a
 * job with the same key is on the queue and not finished, a new dispatch
 * with that key is not added. BullMQ's `deduplication` job option.
 * @param config.limiter BullMQ's worker rate limiter, `{ max, duration }`:
 * at most `max` jobs every `duration` milliseconds. It limits the whole
 * queue, so give the job its own `queue`. The jobs of one queue cannot
 * set different limiters.
 * @param config.input Zod schema for the current version; the handler
 * receives the parsed value.
 * @param config.channel Lets the browser follow each run with
 * `useJobChannel(name)`. Each run broadcasts on the channel of the user
 * who dispatched it, `job:<name>:<userId>`. Only that user may listen,
 * and `authorize` must also allow them. A run with no user behind it
 * broadcasts on `job:<name>`, which `authorize` alone guards, like a
 * {@link defineChannel} channel's. Without `channel` the job broadcasts
 * nothing.
 * @param config.handler The work itself. Its second argument is the
 * {@link JobContext}, whose `reportProgress` broadcasts on the job's
 * channel and whose `dispatcher` is the actor that dispatched the run.
 * The handler runs as that actor, so {@link useAuth} returns it. When it returns, `completed` is broadcast there with
 * `{ result }`, its return value; when its last attempt throws, or it
 * fails at once, `failed` with `{ message }`: the message of a taxonomy error such as a
 * `ValidationFailedError`, or "Something went wrong" for any other
 * error, as over HTTP. These broadcasts are
 * best-effort: one that fails is logged and reported, never failing or
 * retrying the job.
 *
 * @example
 * ```ts
 * // server/jobs/post/notify-subscribers.job.ts
 * export const postNotifySubscribersJob = defineJob({
 *   version: 2,
 *   upcasters: { 1: (old) => ({ postId: (old as { id: number }).id }) },
 *   attempts: 5,
 *   timeout: 30_000,
 *   unique: ({ postId }) => String(postId),
 *   input: z.object({ postId: z.number() }),
 *   async handler({ postId }) {
 *     const post = await findOrFail(postsTable, postId);
 *     await notify(post);
 *   },
 * });
 * ```
 */
export function defineJob<Schema extends z.ZodType, Result>(
  config: JobConfig<Schema, Result> & { channel: JobChannel },
): Job<string, Schema, Awaited<Result>> & { channel: JobChannel };
/**
 * Defines a background job with no channel: it broadcasts nothing. See
 * the overload taking `channel` for everything else {@link defineJob}
 * does.
 */
export function defineJob<Schema extends z.ZodType, Result>(
  config: JobConfig<Schema, Result> & { channel?: undefined },
): Job<string, Schema, Awaited<Result>> & { channel?: undefined };
export function defineJob<Schema extends z.ZodType, Result>(
  config: JobConfig<Schema, Result> & { channel?: JobChannel },
): Job<string, Schema, Awaited<Result>> {
  const version = config.version ?? 1;
  const channel = config.channel;

  async function announce(owner: string | undefined, event: string, payload: unknown) {
    if (!channel) return;

    try {
      await publishChannelMessage(jobChannelName(job.name, owner), event, payload);
    } catch (error) {
      useLogger("job").warn(`${job.name} could not broadcast ${event}`, error, { job: job.name, event });
      reportError(error, { job: job.name });
    }
  }

  const job: Job<string, Schema, Awaited<Result>> = awaitingName(
    {
      name: "",
      queue: config.queue ?? "default",
      version,
      upcasters: Object.keys(config.upcasters ?? {}).map(Number),
      input: config.input,
      channel,
      attempts: config.attempts,
      backoff: config.backoff,
      timeout: config.timeout,
      unique: config.unique,
      limiter: config.limiter,
      async run(data: unknown, attempt = { last: true }) {
        let result: unknown;
        let owner: string | undefined;

        try {
          const envelope = fromJobPayload(data);
          const dispatcher = envelope.dispatcher ?? null;
          owner = dispatcher?.type === "user" ? dispatcher.id : dispatcher?.userId;
          const payload = upcastPayload(envelope, version, config.upcasters ?? {}, `Job "${job.name}"`);

          result = await runAs(dispatcher, async () => {
            const parsed = await config.input.safeParseAsync(payload);

            if (!parsed.success) throw new ValidationFailedError(parsed.error);

            return await withTimeout(
              config.handler(parsed.data, {
                reportProgress: (percent) => announce(owner, "progress", { percent }),
                dispatcher,
              }),
              config.timeout,
              job.name,
            );
          });
        } catch (thrown) {
          const error = classifyError(thrown) ?? thrown;

          if (attempt.last || !isRetryableJobError(error)) {
            await announce(owner, "failed", { message: publicMessage(error) });
          }
          throw error;
        }

        await announce(owner, "completed", { result: result ?? null });
      },
    },
    "job",
  );

  return job;
}

function publicMessage(error: unknown) {
  return isKnownTaxonomyError(error) && error.code !== "INTERNAL_SERVER_ERROR" ? error.message : genericErrorMessage(undefined);
}

function runAs<T>(dispatcher: Actor | null, work: () => T): T {
  return dispatcher ? actorContext.run(dispatcher, work) : actorContext.exit(work);
}

async function withTimeout<T>(work: T, timeout: number | undefined, name: string): Promise<Awaited<T>> {
  if (timeout === undefined) return await work;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Job "${name}" timed out after ${timeout}ms`)), timeout);
  });

  try {
    return await Promise.race([work, expired]);
  } finally {
    clearTimeout(timer);
  }
}
