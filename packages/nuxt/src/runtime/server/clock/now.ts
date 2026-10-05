interface TestClock {
  at: number;
  setAt: number;
  frozen: boolean;
}

let testClock: TestClock | undefined;

/**
 * The current time as a `Date`. Auto-imported on the server.
 *
 * Read the time with `now()` instead of `new Date()` or `Date.now()` in
 * server code. nuxvel reads it for `timestamps()`, soft deletes,
 * rotated secrets, rate limits, backfills, the outbox and flag state.
 * In a test, `travelTo()`, `travelBy()` and `freezeTime()` from
 * `@nuxvel/nuxt/testing` move it. Outside a test it is `new Date()`.
 *
 * @example
 * ```ts
 * const expired = invite.expiresAt <= now();
 * ```
 */
export function now(): Date {
  if (!testClock) return new Date();

  return new Date(testClock.frozen ? testClock.at : testClock.at + Date.now() - testClock.setAt);
}

export function setTestClock(clock: { at: Date; frozen?: boolean } | undefined) {
  testClock = clock && {
    at: clock.at.getTime(),
    setAt: Date.now(),
    frozen: clock.frozen ?? testClock?.frozen ?? false,
  };
}
