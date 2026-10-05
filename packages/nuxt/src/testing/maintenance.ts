import { callApp } from "./settled";

/** Options for {@link startMaintenance}, the flags of `nuxvel down`. */
export interface MaintenanceOptions {
  /** The text of the maintenance page and of the 503 responses. */
  message?: string;
  /** The seconds in the `Retry-After` header. The default is 60. */
  retryAfter?: number;
  /** A token: a browser that opens `/<secret>` gets access. */
  secret?: string;
  /** IP addresses that keep full access. */
  allow?: string[];
  /** Keeps the queue running. By default the queue pauses. */
  keepQueue?: boolean;
}

/**
 * Puts the app under test in maintenance mode, the test-side counterpart
 * of `nuxvel down`.
 *
 * From then on the app answers 503 to every request that is not let
 * through, and the queue is paused unless `keepQueue` is set. The state
 * lives in Redis. `@nuxvel/nuxt/testing/database` flushes the Redis
 * database of the worker after each test, so the app is up again for the
 * next test. Call {@link stopMaintenance} to end maintenance inside a test.
 *
 * @example
 * ```ts
 * await startMaintenance({ message: "Back at 10:00" });
 * ```
 */
export async function startMaintenance(options: MaintenanceOptions = {}): Promise<void> {
  await callApp("maintenance", { down: true, options });
}

/**
 * Takes the app under test out of maintenance mode and resumes the
 * queue, the test-side counterpart of `nuxvel up`.
 *
 * @example
 * ```ts
 * await startMaintenance();
 * await stopMaintenance();
 *
 * expect((await guest().fetch("/posts")).status).toBe(200);
 * ```
 */
export async function stopMaintenance(): Promise<void> {
  await callApp("maintenance", { down: false });
}
