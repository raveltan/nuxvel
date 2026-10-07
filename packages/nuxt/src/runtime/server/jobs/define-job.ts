import type { z } from "zod";
import { actorContext } from "../actions/context";
import type { Actor } from "../actions/system-actor";
import { jobChannelName } from "../../shared/realtime/job-channel";
import { awaitingName } from "../discovery/definition-name";
import { reportError } from "../error-tracking/sentry";
import { genericErrorMessage } from "../errors/generic-message";
import { ValidationFailedError, isKnownTaxonomyError } from "../errors/taxonomy";
import { runningName } from "../logging/log-context";
import { useLogger } from "../logging/logger";
import type { ChannelConnection } from "../realtime/define-channel";
import { publishChannelMessage } from "../realtime/streams/publish-message";
import { type Upcaster, fromJobPayload, upcastPayload } from "./payload";
import { isRetryableJobError } from "./retryable";
import { classifyError } from "../errors/classify";
import { noInput } from "../actions/no-input";
import { type Duration, windowSeconds } from "../security/rate-limit-window";
import type { DispatchOptions } from "./dispatch-job";

/**
 * BullMQ's backoff between the attempts of a job: the `backoff` option of
 * {@link defineJob} in BullMQ's own shape.
 */
export interface JobBackoff {
  /** `fixed` waits `delay` each time, `exponential` doubles it after each attempt. */
  type: "fixed" | "exponential";
  /** The wait in milliseconds. */
  delay?: number;
  /** The share of the wait, from 0 to 1, that is randomized. */
  jitter?: number;
}

/**
 * BullMQ's worker rate limiter: the `limiter` option of {@link defineJob}.
 * At most `max` jobs of the queue run every `duration` milliseconds.
 */
export interface JobLimiter {
  /** The number of jobs that can run in each `duration`. */
  max: number;
  /** The window in milliseconds. */
  duration: number;
}

/**
 * Who may follow a job on its channel: the `channel` option of
 * {@link defineJob}. `{}` lets signed-in users follow it.
 */
export interface JobChannel {
  /** Whether this connection may listen. Defaults to signed-in users only. */
  authorize?: (connection: ChannelConnection) => boolean | Promise<boolean>;
  /** `true` lets guests follow the runs with no user behind them, when `authorize` is left out. */
  public?: boolean;
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
  backoff?: number | JobBackoff;
  timeout?: number;
  unique?(payload: unknown): string;
  limiter?: JobLimiter;
  run: (data: unknown, attempt?: JobAttempt) => Promise<void>;
  /**
   * Queues this job with `input`, to run once the surrounding
   * transaction commits. Outside a transaction it is queued now.
   *
   * The input is the job's `input` schema input, so a wrong input fails
   * to compile. An `outbox` row is written in the same transaction and
   * relayed to the queue after the commit, so a rollback queues nothing
   * and a crash after the commit loses nothing. Throws when an option is
   * out of range. Tests assert on it with `expectQueued`.
   *
   * @param options.delay How long the job waits on the queue before it
   * can run, such as `{ minutes: 1 }`. See {@link DispatchOptions}.
   * @param options.priority BullMQ priority, 1 runs first.
   * @param options.dispatcher The {@link Actor} the job runs as. The
   * current actor when unset, `null` for nobody.
   *
   * @example
   * ```ts
   * await $jobs.post.notifyFollowers.dispatch({ postId: post.id });
   * await $jobs.post.sendDigest.dispatch({ postId: post.id }, { delay: { minutes: 1 }, priority: 10 });
   * ```
   */
  dispatch(...args: DispatchArgs<Schema>): Promise<void>;
  /** Brands the job with its handler's resolved return type; no such property exists at runtime. */
  readonly [jobResult]?: Result;
}

interface JobConfig<Schema extends z.ZodType, Result> {
  queue?: string;
  version?: number;
  upcasters?: Record<number, JobUpcaster>;
  attempts?: number;
  backoff?: Duration | JobBackoff;
  timeout?: Duration;
  unique?: (payload: z.input<Schema>) => string;
  limiter?: JobLimiter;
  input?: Schema;
  handler: (input: z.infer<Schema>, context: JobContext) => Result;
}

type DispatchArgs<Schema extends z.ZodType> = undefined extends z.input<Schema>
  ? [input?: z.input<Schema>, options?: DispatchOptions]
  : [input: z.input<Schema>, options?: DispatchOptions];

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
 * `"post.notify-subscribers"`, what the queue stores, and
 * `$jobs.post.notifySubscribers` in the `$jobs` namespace, whose
 * {@link Job.dispatch} queues it. Moving the file
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
 * @param config.backoff The wait between attempts: a fixed duration such
 * as `{ seconds: 30 }`, or BullMQ's own `{ type: "fixed" | "exponential",
 * delay }`, whose `delay` is in milliseconds. Exponential from one second
 * when unset.
 * @param config.timeout How long one attempt can run, such as
 * `{ seconds: 30 }`. An attempt
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
 * receives the parsed value. Without it the job takes `{}` or
 * `undefined`.
 * @param config.channel Lets the browser follow each run with
 * `useJobChannel(name)`. Each run broadcasts on the channel of the user
 * who dispatched it, `job:<name>:<userId>`. Only that user may listen,
 * and `authorize` must also allow them. A run with no user behind it
 * broadcasts on `job:<name>`, which `authorize` alone guards, like a
 * {@link defineChannel} channel's. Without `authorize`, signed-in users
 * may listen, and `public: true` lets guests listen too. Without
 * `channel` the job broadcasts nothing.
 * @param config.handler The work itself. Each attempt first broadcasts
 * `started` on the job's channel. Its second argument is the
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
 *   timeout: { seconds: 30 },
 *   unique: ({ postId }) => String(postId),
 *   input: z.object({ postId: z.number() }),
 *   async handler({ postId }) {
 *     const post = await findOrFail(postsTable, postId);
 *     await $notifications.post.published.notify(post.authorId, { postId, title: post.title });
 *   },
 * });
 * ```
 */
export function defineJob<Schema extends z.ZodType = typeof noInput, Result = unknown>(
  config: JobConfig<Schema, Result> & { channel: JobChannel },
): Job<string, Schema, Awaited<Result>> & { channel: JobChannel };
/**
 * Defines a background job with no channel: it broadcasts nothing. See
 * the overload taking `channel` for everything else {@link defineJob}
 * does.
 */
export function defineJob<Schema extends z.ZodType = typeof noInput, Result = unknown>(
  config: JobConfig<Schema, Result> & { channel?: undefined },
): Job<string, Schema, Awaited<Result>> & { channel?: undefined };
export function defineJob<Schema extends z.ZodType = typeof noInput, Result = unknown>(
  config: JobConfig<Schema, Result> & { channel?: JobChannel },
): Job<string, Schema, Awaited<Result>> {
  const version = config.version ?? 1;
  // Schema falls back to typeof noInput exactly when config.input is omitted
  const input = config.input ?? (noInput as unknown as Schema);
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
      input,
      channel,
      attempts: config.attempts,
      backoff: config.backoff === undefined || "type" in config.backoff ? config.backoff : Math.round(windowSeconds(config.backoff) * 1000),
      timeout: config.timeout === undefined ? undefined : Math.round(windowSeconds(config.timeout) * 1000),
      unique: config.unique,
      limiter: config.limiter,
      async dispatch(payload?: unknown, options?: DispatchOptions) {
        // a static import reaches the #nuxvel/jobs registry, which holds this job
        const { dispatchJob } = await import("./dispatch-job");

        await dispatchJob(job, payload, options);
      },
      async run(data: unknown, attempt = { last: true }) {
        let result: unknown;
        let owner: string | undefined;

        try {
          const envelope = fromJobPayload(data);
          const dispatcher = envelope.dispatcher ?? null;
          owner = dispatcher?.type === "user" ? dispatcher.id : dispatcher?.userId;
          const payload = upcastPayload(envelope, version, config.upcasters ?? {}, `Job "${job.name}"`);

          await announce(owner, "started", {});

          result = await runAs(dispatcher, job.name, async () => {
            const parsed = await input.safeParseAsync(payload);

            if (!parsed.success) throw new ValidationFailedError(parsed.error);

            return await withTimeout(
              config.handler(parsed.data, {
                reportProgress: (percent) => announce(owner, "progress", { percent }),
                dispatcher,
              }),
              job.timeout,
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

function runAs<T>(dispatcher: Actor | null, name: string, work: () => T): T {
  return runningName.run(name, () => (dispatcher ? actorContext.run(dispatcher, work) : actorContext.exit(work)));
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
