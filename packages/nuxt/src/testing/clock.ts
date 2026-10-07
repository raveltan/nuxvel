import { setTestClock } from "../runtime/server/clock/now";
import { callControlChannel } from "./control-channel";

/** A length of time for {@link travelBy}. Every field adds to the others. */
export interface TravelDuration {
  days?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
}

async function moveClock(input: { to?: Date; byMs?: number; frozen?: true }): Promise<Date> {
  const at = await callControlChannel<Date>("clock", input);
  setTestClock({ at, frozen: input.frozen });
  return at;
}

function milliseconds({ days = 0, hours = 0, minutes = 0, seconds = 0 }: TravelDuration) {
  return (((days * 24 + hours) * 60 + minutes) * 60 + seconds) * 1000;
}

/**
 * Sets the clock of the app under test to `date`, and returns the app's
 * new time.
 *
 * Moves `now()`, which `timestamps()`, soft deletes, rotated secrets
 * and the other time-reading helpers use, in the app and in the Vitest
 * process, so a row from a factory gets the same time as a row that the
 * app writes. The clock keeps ticking from `date`, unless
 * {@link freezeTime} stopped it. A `new Date()` in the test and the time
 * in Postgres do not change.
 * `@nuxvel/nuxt/testing/setup` puts the real time back after every
 * test. See {@link travelBy}.
 *
 * @example
 * ```ts
 * await travelTo(new Date("2030-01-01T00:00:00Z"));
 * ```
 */
export async function travelTo(date: Date): Promise<Date> {
  return moveClock({ to: date });
}

/**
 * Moves the clock of the app under test forward by `duration`, and
 * returns the app's new time. Works like {@link travelTo}.
 *
 * @example
 * ```ts
 * await travelBy({ days: 31 });
 * ```
 */
export async function travelBy(duration: TravelDuration): Promise<Date> {
  return moveClock({ byMs: milliseconds(duration) });
}

/**
 * Stops the clock of the app under test at `date`, or at the app's
 * current time, and returns that time. Every `now()` in the app and in
 * the Vitest process then returns the same time until {@link travelTo} or {@link travelBy} moves
 * it, or the test ends.
 *
 * @example
 * ```ts
 * const frozenAt = await freezeTime();
 * const post = await api.post.create({ title: "Hello", body: "" });
 * expect(post.createdAt).toEqual(frozenAt);
 * ```
 */
export async function freezeTime(date?: Date): Promise<Date> {
  return moveClock({ to: date, frozen: true });
}
