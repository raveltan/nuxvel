import { UnrecoverableError } from "bullmq";
import { z } from "zod";
import type { Actor } from "../actions/system-actor";

/**
 * The wire shape of everything on the queue: a payload plus the
 * {@link defineJob} version it was written under.
 *
 * A payload enqueued under an older version keeps its own `version`, so
 * a worker running newer code can still tell what it is holding and
 * upcast it. `dispatcher` is the {@link Actor} the job runs as, left out
 * when there is none.
 */
export interface JobPayload {
  version: number;
  payload: unknown;
  dispatcher?: Actor;
}

const storedActor = z
  .object({ type: z.string(), id: z.string(), role: z.string().optional(), userId: z.string().optional() })
  .optional();

/** Wraps a payload for the queue, tagging it with the job's version and its dispatcher. */
export function toJobPayload(version: number, payload: unknown, dispatcher: Actor | null = null): JobPayload {
  return dispatcher ? { version, payload, dispatcher } : { version, payload };
}

/**
 * Reads a queued job's data back, throwing BullMQ's `UnrecoverableError`
 * — no retry could fix it — when it is not a
 * {@link JobPayload} — anything put on the queue by hand rather than by
 * {@link dispatchAfterCommit}.
 */
export function fromJobPayload(data: unknown): JobPayload {
  if (
    !data ||
    typeof data !== "object" ||
    !("version" in data) ||
    typeof data.version !== "number"
  ) {
    throw new UnrecoverableError("Queued job data is not a { version, payload } envelope");
  }

  const dispatcher = storedActor.safeParse("dispatcher" in data ? data.dispatcher : undefined);

  if (!dispatcher.success) throw new UnrecoverableError("Queued job data has a dispatcher that is not an actor");

  return {
    version: data.version,
    payload: "payload" in data ? data.payload : undefined,
    ...(dispatcher.data && { dispatcher: dispatcher.data }),
  };
}

/** Turns a payload written under one version into the next version's shape. */
export type Upcaster = (payload: unknown) => unknown;

/**
 * Walks a queued payload up to `target` through the upcaster registered
 * for each version it passes, returning the current-version payload.
 *
 * Throws BullMQ's `UnrecoverableError` — no retry could fix it — when a
 * version on the way has no upcaster, and when the payload is newer than
 * the code reading it. `label` names the job or event in
 * those messages.
 */
export function upcastPayload(
  data: JobPayload,
  target: number,
  upcasters: Record<number, Upcaster>,
  label: string,
): unknown {
  let { version, payload } = data;

  if (version > target) {
    throw new UnrecoverableError(
      `${label} received payload version ${version}, newer than the defined version ${target}`,
    );
  }

  while (version < target) {
    const step = upcasters[version];

    if (!step) {
      throw new UnrecoverableError(`${label} has no upcaster for payload version ${version}`);
    }

    payload = step(payload);
    version += 1;
  }

  return payload;
}
