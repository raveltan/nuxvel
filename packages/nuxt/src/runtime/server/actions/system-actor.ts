/**
 * Who is performing an action: a `"user"`, a `"system"` process
 * ({@link systemActor}), an API key (`"api-key"`, from
 * {@link apiKeyActor}), or any other caller type the app introduces.
 * `userId` is the user behind the actor: the user of a {@link userActor}
 * and the owner of an API key. A system actor has none.
 */
export interface Actor {
  type: "user" | "system" | "api-key" | (string & {});
  id: string;
  role?: string;
  userId?: string;
}

/**
 * An {@link Actor} for work with no user behind it — a cron job, a queue
 * worker, a seed script.
 *
 * Policy rules reject system actors unless the rule is wrapped in
 * {@link allowSystem}.
 *
 * @param name Identifies the process in traces and audit rows.
 *
 * @example
 * ```ts
 * await archivePostAction({ id }, { actor: systemActor("nightly-cleanup") });
 * ```
 */
export function systemActor(name: string): Actor {
  return { type: "system", id: name };
}
