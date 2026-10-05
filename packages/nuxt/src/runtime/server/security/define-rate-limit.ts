import { awaitingName } from "../discovery/definition-name";
import { type RateLimitWindow, checkedPoints, windowSeconds } from "./rate-limit-window";

/**
 * A shared rate limit from {@link defineRateLimit}: its name, and how
 * many attempts one key may make per sliding window.
 */
export interface RateLimit<Name extends string = string> {
  readonly name: Name;
  readonly points: number;
  readonly window: RateLimitWindow;
}

/**
 * Defines a shared rate limit, named after its file.
 *
 * `defineRateLimit` is auto-imported. One limit per file, under
 * `server/rate-limits/`; the file is discovered, and its path is the
 * limit's name (`server/rate-limits/export.rate-limit.ts` is `"export"`), part of
 * {@link RateLimitName}. Consume it by name with {@link rateLimiter},
 * or reuse it at a point of use with {@link rateLimit} or an action's
 * `rateLimit: { limit }`; every use shares one budget per key.
 * `server/rate-limits/login.rate-limit.ts` replaces the built-in `login` limit
 * (5 per minute), which sets how often one client may sign in or sign up;
 * `server/rate-limits/api-key.rate-limit.ts` replaces the built-in `api-key` limit
 * (60 per minute), which sets how often one API key may call an
 * `authedProcedure`; `server/rate-limits/channel-join.rate-limit.ts` replaces the
 * built-in `channel-join` limit (60 per minute) on realtime channel joins and on each channel of a multiplexed open.
 * A `renamed()` alias here stops the server: a limit stores nothing
 * worth keeping under its name.
 *
 * @param config.points Attempts allowed inside one window, per key.
 * @param config.window How long the sliding window lasts, e.g. `{ hours: 1 }`.
 *
 * @example
 * ```ts
 * // server/rate-limits/export.rate-limit.ts
 * export const exportRateLimit = defineRateLimit({ points: 10, window: { hours: 1 } });
 * ```
 */
export function defineRateLimit(config: { points: number; window: RateLimitWindow }): RateLimit {
  windowSeconds(config.window);

  return awaitingName({ name: "", points: checkedPoints(config.points), window: config.window }, "rate limit");
}
