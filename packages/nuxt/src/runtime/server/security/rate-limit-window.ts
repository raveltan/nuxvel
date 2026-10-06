const UNIT_SECONDS = { seconds: 1, minutes: 60, hours: 3600, days: 86_400 } as const;

type WindowUnit = keyof typeof UNIT_SECONDS;

const UNITS: readonly WindowUnit[] = ["seconds", "minutes", "hours", "days"];

/**
 * A length of time, as one or more units that add up: `{ seconds: 30 }`,
 * `{ minutes: 5 }`, `{ hours: 1, minutes: 30 }`, `{ days: 7 }`. A cache
 * TTL, a rate limit's window, a `signedUrl()` expiry and a job's
 * `timeout`, `backoff` and dispatch `delay` all take one. At least one
 * unit is required, so `{}` fails to compile, and the total must be
 * longer than zero. Unlike a schedule's {@link ScheduleEvery}, which
 * takes exactly one unit that divides the next, any units and amounts
 * add up here, fractions included: `{ seconds: 0.5 }`.
 */
export type Duration = {
  [Unit in WindowUnit]: Record<Unit, number> & Partial<Record<Exclude<WindowUnit, Unit>, number>>;
}[WindowUnit];

/** How long a rate limit's sliding window lasts: a {@link Duration}, such as `{ minutes: 1 }`. */
export type RateLimitWindow = Duration;

export function windowSeconds(window: Duration): number {
  const seconds = UNITS.reduce((total, unit) => total + (window[unit] ?? 0) * UNIT_SECONDS[unit], 0);

  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`nuxvel: a duration must be longer than zero, got ${JSON.stringify(window)}`);
  }

  return seconds;
}

export function checkedPoints(points: number): number {
  if (!Number.isInteger(points) || points < 1) {
    throw new Error(`nuxvel: a rate limit's points must be a whole number of at least 1, got ${points}`);
  }

  return points;
}
