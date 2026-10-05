import type { Actor } from "./system-actor";

/**
 * The `type` of every actor {@link apiKeyActor} makes. Compare against it
 * rather than the bare string.
 */
export const API_KEY_ACTOR_TYPE = "api-key";

/**
 * An {@link Actor} for a request signed with an API key: `id` is the key,
 * `userId` the user who owns it.
 *
 * Auto-imported on the server. The sibling of {@link userActor} and
 * {@link systemActor}. `authedProcedure` gives you this actor as
 * `ctx.actor` when the request sends `Authorization: Bearer nxk_…`, and
 * `ctx.user` is then the key's owner. A policy rule that checks
 * ownership compares `actor.userId`, not `actor.id`. Audit rows record
 * the key as the actor.
 *
 * @example
 * ```ts
 * update: (actor, post) =>
 *   post.authorId === (actor.type === API_KEY_ACTOR_TYPE ? actor.userId : actor.id),
 * ```
 */
export function apiKeyActor(key: { id: string; userId: string }): Actor {
  return { type: API_KEY_ACTOR_TYPE, id: key.id, userId: key.userId };
}
