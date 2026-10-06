import type { Actor } from "./system-actor";

/**
 * An {@link Actor} for a user, with their `role`, so that policy rules
 * that check `actor.role` see it, and their id as `userId`, as an
 * {@link apiKeyActor} has the id of its owner. Code that needs the user
 * behind any actor reads `actor.userId`.
 *
 * Auto-imported on the server. The sibling of {@link systemActor}.
 * `authedProcedure` already gives you this actor as `ctx.actor`. Use
 * `userActor()` outside a procedure: a plain route, an `authorize`
 * callback, a task.
 *
 * @example
 * ```ts
 * const { user } = await requireAuth();
 * await createPostAction(input, { actor: userActor(user) });
 * ```
 */
export function userActor(user: { id: string; role: string }): Actor & { userId: string } {
  return { type: "user", id: user.id, role: user.role, userId: user.id };
}
