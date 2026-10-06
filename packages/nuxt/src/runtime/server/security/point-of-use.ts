import type { TRPCMiddlewareFunction } from "@trpc/server";
import { type H3Event, isEvent } from "h3";
import { type SessionUser, auth } from "../utils/auth";
import { consumeLimit } from "./consume-limit";
import type { RateLimit } from "./define-rate-limit";
import { ipKey, requestEvent, userKey } from "./rate-limit-key";
import { type RateLimitName, sharedLimit } from "./rate-limit-registry";
import { type RateLimitWindow, checkedPoints, windowSeconds } from "./rate-limit-window";

/**
 * What a {@link rateLimit} `by` function reads its key from: the request,
 * in a handler and in a tRPC procedure alike. A procedure's key function
 * gets the request too, not tRPC's `{ ctx, input }`; for a key from the
 * input, limit an action instead, whose `by` function gets its parsed
 * `{ input, actor }` (see {@link ActionRateLimit}).
 */
export interface RateLimitKeyContext {
  /** The request being limited. */
  event: H3Event;
}

/**
 * Who shares one budget under a {@link rateLimit}: the client IP (keyed
 * `ip:<address>`, or `ip:<prefix>::/64` for an IPv6 client, so one /64
 * network shares a budget), the signed-in user (`user:<id>`), or any string a
 * function derives from the request, used as it is, the same key
 * {@link rateLimiter}'s `consume(key)` takes.
 */
export type RateLimitBy = "ip" | "user" | ((ctx: RateLimitKeyContext) => string);

/**
 * {@link rateLimit}'s options: a limit written where it is used, counted
 * under the route or procedure, or a shared `limit` from
 * `server/rate-limits/`, counted under that limit's name with every other
 * use of it. The same shape as `defineAction`'s `rateLimit` option.
 */
export type RateLimitOptions<By extends RateLimitBy = RateLimitBy> =
  | {
      /** Attempts allowed inside one window, per key. */
      points: number;
      /** How long the sliding window lasts, e.g. `{ minutes: 1 }`. */
      window: RateLimitWindow;
      /** Who shares one budget: `"ip"`, `"user"` or a key function. */
      by: By;
    }
  | {
      /** The shared limit to count against: its name or its {@link defineRateLimit} default export. */
      limit: RateLimitName | RateLimit;
      /** Who shares one budget: `"ip"`, `"user"` or a key function. */
      by: By;
    };

/**
 * What {@link rateLimit} returns: a request hook for an h3 handler's
 * `onRequest` and a tRPC middleware for a procedure's `.use()`, in one
 * value. `Context` is what a procedure's `ctx` must hold: `{ user }` for
 * a limit `by: "user"`.
 */
export type RateLimitHook<Context extends object = object> = ((event: H3Event) => Promise<void>) &
  TRPCMiddlewareFunction<Context, object, object, object, unknown>;

type ProcedureCall = Parameters<TRPCMiddlewareFunction<{ user?: SessionUser }, object, object, object, unknown>>[0];

interface Budget {
  key: string;
  points: number;
  seconds: number;
}

const procedureLimits = new WeakMap<
  object,
  { by: RateLimitBy; budget: (place: string) => Budget; consume: (place: string, key: string) => Promise<void> }
>();

function routePattern(event: H3Event) {
  const pattern = event.context.matchedRoute?.path;

  if (!pattern) {
    throw new Error(
      `nuxvel: rateLimit() in onRequest needs a routed handler (server/api or server/routes), but ${event.path} matched no route`,
    );
  }

  return `${event.method} ${pattern}`;
}

function requestKey(event: H3Event, requestBy: Exclude<RateLimitBy, "user">) {
  return requestBy === "ip" ? ipKey(event) : requestBy({ event });
}

async function eventKey(event: H3Event, by: RateLimitBy) {
  return by === "user" ? userKey((await auth())?.user) : requestKey(event, by);
}

function budgetOf(options: RateLimitOptions): (place: string) => Budget {
  if ("limit" in options) {
    const { limit } = options;

    return () => {
      const { name, points, seconds } = sharedLimit(typeof limit === "string" ? limit : limit.name);

      return { key: name, points, seconds };
    };
  }

  const points = checkedPoints(options.points);
  const seconds = windowSeconds(options.window);

  return (place) => ({ key: place, points, seconds });
}

/**
 * A sliding-window rate limit written where it is used: in an h3
 * handler's `onRequest`, or as a tRPC procedure's `.use()`.
 *
 * Auto-imported on the server. The counter is keyed automatically: by
 * method and route pattern (`GET /api/posts/:id`) in a handler, by
 * procedure path (`post.create`) in a procedure, then by `by`. Given a
 * shared `limit` from `server/rate-limits/` instead of `points` and
 * `window`, it counts under that limit's name, sharing one budget with
 * every other use and with {@link rateLimiter}. Counts live in Redis, so every instance
 * shares one. Past the limit it throws {@link RateLimitedError}: a 429
 * whose `retryAfter` is the seconds until the next attempt fits, sent as
 * the `Retry-After` header too. Every counted request also gets
 * `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset`.
 *
 * `by: "user"` on a procedure only compiles after {@link authedProcedure}
 * (or anything else that puts a `user` in `ctx`); in a handler, a
 * signed-out request gets {@link UnauthenticatedError}. `"ip"` and a key
 * function need the request, so a procedure called outside one throws.
 * For an action, use `defineAction`'s `rateLimit` option instead.
 *
 * @param options.points Attempts allowed inside one window, per key.
 * @param options.window How long the sliding window lasts, e.g. `{ minutes: 1 }`.
 * @param options.limit A shared limit, by name or by its {@link defineRateLimit}
 * definition, in place of `points` and `window`.
 * @param options.by `"ip"`, `"user"`, or a function of `{ event }`
 * returning the key.
 *
 * @example
 * ```ts
 * // server/api/search.get.ts
 * export default defineEventHandler({
 *   onRequest: [rateLimit({ points: 30, window: { minutes: 1 }, by: "ip" })],
 *   handler: (event) => search(getQuery(event)),
 * });
 *
 * // server/trpc/routers/post.router.ts
 * create: authedProcedure
 *   .use(rateLimit({ points: 5, window: { minutes: 1 }, by: "user" }))
 *   .action($actions.posts.createPost),
 *
 * // server/api/export.post.ts, sharing server/rate-limits/export.rate-limit.ts
 * export default defineEventHandler({
 *   onRequest: [rateLimit({ limit: "export", by: "user" })],
 *   handler: (event) => exportData(event),
 * });
 * ```
 */
export function rateLimit(options: RateLimitOptions<"user">): RateLimitHook<{ user: SessionUser }>;
export function rateLimit(options: RateLimitOptions<Exclude<RateLimitBy, "user">>): RateLimitHook;
export function rateLimit(options: RateLimitOptions): RateLimitHook {
  const budget = budgetOf(options);
  const { by } = options;

  async function consume(place: string, key: string) {
    const { key: counter, points, seconds } = budget(place);

    await consumeLimit(`${counter}:${key}`, points, seconds);
  }

  async function limitRoute(event: H3Event) {
    await consume(`route/${routePattern(event)}`, await eventKey(event, by));
  }

  async function limitProcedure(call: ProcedureCall) {
    const key = by === "user" ? userKey(call.ctx.user) : requestKey(requestEvent(`the procedure ${call.path}`), by);

    await consume(`trpc/${call.path}`, key);

    return call.next();
  }

  const hook = (target: H3Event | ProcedureCall) => (isEvent(target) ? limitRoute(target) : limitProcedure(target));

  procedureLimits.set(hook, { by, budget, consume });

  // one function serves both h3's onRequest and tRPC's .use(), which only an intersection of the two signatures types
  return hook as RateLimitHook;
}

export async function spendProcedureLimit(
  middlewares: readonly unknown[],
  path: string,
  identity: { userId?: string; event: H3Event },
) {
  for (const middleware of middlewares) {
    const inline = typeof middleware === "function" ? procedureLimits.get(middleware) : undefined;

    if (!inline) continue;

    const key =
      inline.by === "user"
        ? userKey(identity.userId ? { id: identity.userId } : undefined)
        : requestKey(identity.event, inline.by);
    const { points } = inline.budget(`trpc/${path}`);

    for (let attempt = 0; attempt < points; attempt++) await inline.consume(`trpc/${path}`, key);
  }
}

export async function limitRequest(options: RateLimitOptions, place: string, event: H3Event) {
  const { key, points, seconds } = budgetOf(options)(place);

  await consumeLimit(`${key}:${await eventKey(event, options.by)}`, points, seconds);
}
