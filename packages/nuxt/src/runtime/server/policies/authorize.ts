import { getTableName, type InferSelectModel, type Table } from "drizzle-orm";
import type { Actor } from "../actions/system-actor";
import { ForbiddenError } from "../errors/forbidden-error";
import { abilityCall, canByName, type CanArgs, type PolicyAction } from "./can";
import type { AbilityRef } from "./define-policy";

/**
 * Asserts the actor may perform an action on `row`, throwing
 * {@link ForbiddenError} otherwise. Pass an {@link AbilityRef} such as
 * `postPolicy.update`, or the rule name and the table.
 *
 * Auto-imported on the server. Use it in actions; use {@link can} when you
 * want a boolean instead. The name is one of the rules the table's policy
 * defines ({@link PolicyAction}).
 *
 * @example
 * ```ts
 * await authorize(ctx.actor, postPolicy.update, post);
 * await authorize(ctx.actor, "update", postsTable, post);
 * ```
 */
export function authorize<T extends Table>(actor: Actor, ability: AbilityRef<T>, row: InferSelectModel<T>): Promise<void>;
export function authorize<T extends Table>(
  actor: Actor,
  action: PolicyAction<T>,
  table: T,
  row: InferSelectModel<T>,
): Promise<void>;
export async function authorize(
  actor: Actor,
  ...args: CanArgs
): Promise<void> {
  const [action, table, row] = abilityCall(args);
  if (await canByName(actor, action, table, row)) return;

  throw new ForbiddenError(
    `Actor ${actor.type}:${actor.id} is not allowed to ${action} ${getTableName(table)}`,
  );
}
