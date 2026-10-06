import type { Actor } from "./system-actor";

/**
 * An {@link Actor} for a request signed with an API key: `id` is the key,
 * `userId` the user who owns it.
 *
 * Auto-imported on the server. The sibling of {@link userActor} and
 * {@link systemActor}. `authedProcedure` gives you this actor as
 * `ctx.actor` when the request sends `Authorization: Bearer nxk_…`, and
 * `ctx.user` is then the key's owner. A policy rule that checks
 * ownership compares `actor.userId`, not `actor.id`. Audit rows record
 * the key as the actor. Its `type` is `"api-key"`.
 *
 * @example
 * ```ts
 * update: (actor, post) => post.authorId === actor.userId,
 * ```
 */
export function apiKeyActor(key: { id: string; userId: string }): Actor & { userId: string } {
  return { type: "api-key", id: key.id, userId: key.userId };
}
