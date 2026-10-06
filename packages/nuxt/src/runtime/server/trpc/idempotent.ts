import { createHash } from "node:crypto";
import type { TRPCMiddlewareFunction } from "@trpc/server";
// tRPC has no public way for a middleware to answer without running the resolver
import { middlewareMarker } from "@trpc/server/unstable-core-do-not-import";
import { getRequestHeader } from "h3";
import { currentEvent } from "../utils/current-event";
import superjson from "superjson";
import { ConflictError } from "../errors/taxonomy";
import { useRedis } from "../redis/client";
import { redisKey } from "../redis/key";
import { IDEMPOTENCY_KEY_HEADER } from "../../shared/trpc/idempotency-key";

const STORED_SECONDS = 24 * 60 * 60;
const RUNNING = "running";

function requestIdempotencyKey() {
  const event = currentEvent();

  return event && getRequestHeader(event, IDEMPOTENCY_KEY_HEADER);
}

/**
 * tRPC middleware that runs a mutation once per idempotency key and
 * answers every repeat with the first result.
 *
 * Auto-imported on the server. The client sends the key in the
 * `Idempotency-Key` header: `mutationOptions()` and `.useMutation()` of `$api`,
 * and so {@link useActionForm}, send one for every call. The first result is
 * stored in Redis for 24 hours under the user, the procedure path, the
 * key and the input, so a repeat with other input runs again. A repeat
 * while the first call still runs throws {@link ConflictError}. A call
 * that fails stores nothing, so a retry runs again. A call without the
 * header runs as usual.
 *
 * @example
 * ```ts
 * create: authedProcedure
 *   .use(idempotent())
 *   .action($actions.posts.createPost),
 * ```
 */
export function idempotent(): TRPCMiddlewareFunction<{ user?: { id: string } }, object, object, object, unknown> {
  return async ({ ctx, path, getRawInput, next }) => {
    const clientKey = requestIdempotencyKey();

    if (!clientKey) return next();

    const inputHash = createHash("sha256").update(superjson.stringify(await getRawInput())).digest("hex");
    const key = redisKey(`nuxvel:idempotency:${ctx.user?.id ?? "guest"}:${path}:${clientKey}:${inputHash}`);
    const redis = useRedis("durable");

    if (!(await redis.set(key, RUNNING, "EX", STORED_SECONDS, "NX"))) {
      const stored = await redis.get(key);

      if (stored === null || stored === RUNNING) throw new ConflictError("This request is still running; try again shortly");

      return { ok: true, data: superjson.parse(stored), marker: middlewareMarker };
    }

    const result = await next();

    if (result.ok) await redis.set(key, superjson.stringify(result.data), "EX", STORED_SECONDS);
    else await redis.del(key);

    return result;
  };
}
