import rateLimits from "#nuxvel/rate-limits";
import type { Defined } from "../discovery/aliases";
import type { RateLimit } from "./define-rate-limit";
import { windowSeconds } from "./rate-limit-window";

export const LOGIN_RATE_LIMIT = "login";
export const CHANNEL_JOIN_RATE_LIMIT = "channel-join";
export const API_KEY_RATE_LIMIT = "api-key";

export const BUILT_IN_RATE_LIMITS = new Map<string, Pick<RateLimit, "points" | "window">>([
  [LOGIN_RATE_LIMIT, { points: 5, window: { minutes: 1 } }],
  [CHANNEL_JOIN_RATE_LIMIT, { points: 60, window: { minutes: 1 } }],
  [API_KEY_RATE_LIMIT, { points: 60, window: { minutes: 1 } }],
]);

/**
 * The name of every shared limit: each file under `server/rate-limits/`,
 * plus the built-in `login`, `channel-join` and `api-key`. What {@link rateLimiter} takes.
 */
export type RateLimitName =
  | Defined<(typeof rateLimits)[number]>["name"]
  | typeof LOGIN_RATE_LIMIT
  | typeof CHANNEL_JOIN_RATE_LIMIT
  | typeof API_KEY_RATE_LIMIT;

function definitions(): readonly RateLimit[] {
  return rateLimits;
}

export function sharedLimit(name: string) {
  const limit =
    definitions().find((candidate) => candidate.name === name) ??
    BUILT_IN_RATE_LIMITS.get(name);

  if (!limit) throw new Error(`nuxvel: no rate limit is named "${name}"; define it in server/rate-limits/${name}.ts`);

  return { name, points: limit.points, seconds: windowSeconds(limit.window) };
}
