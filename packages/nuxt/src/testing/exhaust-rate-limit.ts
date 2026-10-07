import type { RateLimit } from "../runtime/server/security/define-rate-limit";
import type { RateLimitName } from "../runtime/server/security/rate-limit-registry";
import { callerPaths } from "./acting-as";
import { callApp } from "./settled";

/**
 * Who shares the budget in a shared rate limit: a user (`by: "user"`), an
 * IP address (`by: "ip"`), or the string that a key function returns.
 */
export type RateLimitIdentity = { user: { id: string } } | { ip: string } | string;

type TestProcedure = (...args: never[]) => Promise<unknown>;

function keyOf(identity: RateLimitIdentity) {
  if (typeof identity === "string") return identity;

  return "user" in identity ? `user:${identity.user.id}` : `ip:${identity.ip}`;
}

/**
 * Spends every attempt of a rate limit in the app under test, so the next
 * attempt is refused.
 *
 * Give a shared limit and the identity that uses it: `{ user }` for
 * `by: "user"`, `{ ip }` for `by: "ip"`, or the string that a key function
 * returns. Or give a procedure of {@link actingAs}`().api` or
 * {@link guest}`().api`: the helper then spends the inline `rateLimit()`
 * of that procedure for the identity of that client, and does not call the
 * procedure. The next request answers 429, or `TOO_MANY_REQUESTS` for a
 * procedure. Each test starts with fresh counts. Throws when the procedure
 * is not a procedure of a test client.
 *
 * @param limit A {@link RateLimitName}, or the definition of the limit or
 * its stub from `#nuxvel/test-namespaces`, or a procedure of a test client;
 * a name no limit has fails to compile.
 * @param identity The key of a shared limit. Not used with a procedure.
 *
 * @example
 * ```ts
 * await exhaustRateLimit("export", { user });
 * await expect(actingAs(user).api.post.export()).rejects.toBeTrpcError("TOO_MANY_REQUESTS");
 *
 * await exhaustRateLimit(guest().api.tickets.public.open);
 * ```
 */
export async function exhaustRateLimit(limit: RateLimitName | RateLimit, identity: RateLimitIdentity): Promise<void>;
export async function exhaustRateLimit(procedure: TestProcedure): Promise<void>;
export async function exhaustRateLimit(
  limit: RateLimitName | RateLimit | TestProcedure,
  identity?: RateLimitIdentity,
): Promise<void> {
  if (typeof limit === "function") {
    const caller = callerPaths.get(limit);

    if (!caller) throw new Error("exhaustRateLimit: pass a procedure of actingAs().api or guest().api");

    await callApp("exhaust-rate-limit", { procedure: caller.path.join("."), userId: caller.userId }, await caller.headers());

    return;
  }

  if (identity === undefined) throw new Error("exhaustRateLimit: pass the identity of the limit, for example { user }");

  await callApp("exhaust-rate-limit", { name: typeof limit === "string" ? limit : limit.name, key: keyOf(identity) });
}
