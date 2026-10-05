import { consumeLimit } from "./consume-limit";
import type { RateLimit } from "./define-rate-limit";
import { type RateLimitName, sharedLimit } from "./rate-limit-registry";

export type { RateLimitName };

/**
 * A shared, Redis-backed rate limiter counting attempts per key over a
 * sliding window.
 *
 * Auto-imported on the server. Limits are files under
 * `server/rate-limits/`, from {@link defineRateLimit}; `login` exists by
 * default (5 attempts per minute) and sets how often one client may try
 * to sign in or sign up, and `api-key` (60 per minute) how often one API
 * key may call an `authedProcedure`. `channel-join` also exists by default
 * (60 per minute) and sets how often one user, or one guest IP, may join a
 * realtime channel, over `POST /api/channels/join` or once per channel of a
 * `GET /api/channels` open. Counts live on the `durable` connection of
 * {@link useRedis}. To limit a route, procedure or action, reach for
 * {@link rateLimit} instead, which keys the counter for you.
 *
 * `consume(key)` records one attempt and resolves with the attempts left.
 * Past the limit it records nothing and throws {@link RateLimitedError},
 * whose `retryAfter` says how many seconds until the next attempt fits.
 * Inside a request, it sets `RateLimit-Limit`, `RateLimit-Remaining` and
 * `RateLimit-Reset` on the response.
 * `key` shares one namespace with {@link rateLimit}'s `by`: a key
 * function's string counts as it is, `by: "ip"` as `ip:<address>` (`ip:<prefix>::/64` for IPv6) and
 * `by: "user"` as `user:<id>`, so a matching key spends the same budget.
 * `limit` is a {@link RateLimitName}, so a limit no file defines fails
 * to compile, or the limit's definition (`$rateLimits.export` or an
 * import); an unknown name also throws at runtime.
 *
 * @example
 * ```ts
 * await rateLimiter("export").consume(`user:${user.id}`);
 * await rateLimiter($rateLimits.export).consume(`user:${user.id}`);
 * ```
 */
export function rateLimiter(limit: RateLimitName | RateLimit) {
  const name = typeof limit === "string" ? limit : limit.name;

  return {
    consume(key: string) {
      const { points, seconds } = sharedLimit(name);

      return consumeLimit(`${name}:${key}`, points, seconds);
    },
  };
}
