/**
 * The `type` of every actor {@link systemActor} makes. Compare against it
 * rather than the bare string.
 */
export const SYSTEM_ACTOR_TYPE = "system";

/**
 * Who is performing an action: a `"user"`, a system process
 * ({@link SYSTEM_ACTOR_TYPE}), an API key (`"api-key"`, from
 * {@link apiKeyActor}), or any other caller type the app introduces.
 * `userId` is the user an API key acts for.
 */
export interface Actor {
  type: "user" | typeof SYSTEM_ACTOR_TYPE | "api-key" | (string & {});
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
  return { type: SYSTEM_ACTOR_TYPE, id: name };
}
