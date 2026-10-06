import { getTableName, type InferSelectModel, type Table } from "drizzle-orm";
import { ForbiddenError } from "../errors/forbidden-error";
import { abilityCall, canByName, type CanArgs, type PolicyAction, policyActor } from "./can";
import type { AbilityRef } from "./define-policy";

/**
 * Asserts the current actor may perform an action on `row`, throwing
 * {@link ForbiddenError} otherwise. Pass an {@link AbilityRef} such as
 * `postPolicy.update`, or the rule name and the table.
 *
 * Auto-imported on the server. Reads the ambient actor, as {@link can}
 * does. Use {@link can} when you want a boolean instead. The name is one
 * of the rules the table's policy defines ({@link PolicyAction}).
 *
 * @example
 * ```ts
 * await authorize($policies.post.update, post);
 * await authorize("update", postsTable, post);
 * ```
 */
export function authorize<T extends Table>(ability: AbilityRef<T>, row: InferSelectModel<T>): Promise<void>;
export function authorize<T extends Table>(action: PolicyAction<T>, table: T, row: InferSelectModel<T>): Promise<void>;
export async function authorize(...args: CanArgs): Promise<void> {
  const actor = await policyActor("authorize");
  const [action, table, row] = abilityCall(args);
  if (await canByName(actor, action, table, row)) return;

  throw new ForbiddenError(
    `Actor ${actor.type}:${actor.id} is not allowed to ${action} ${getTableName(table)}`,
  );
}
