import { getTableName, type InferSelectModel, type Table } from "drizzle-orm";
import type { PolicyAction } from "../runtime/server/policies/can";
import { callApp } from "./settled";

/**
 * Whether a user may perform a policy rule on a row, answered by the
 * app's policy for the row's table.
 *
 * It gives the same answer as the server's {@link can} for the `userActor`
 * of that user, role included, so the `preload` of the policy runs. To
 * test a procedure that uses a rule, use {@link actingAs} and
 * {@link expectRefused}.
 *
 * @param user A user row. The test builds the actor from it, as {@link runAction} does.
 * @param action A rule that the policy of the table defines; another name fails to compile.
 *
 * @example
 * ```ts
 * const post = await postFactory({ authorId: author.id });
 * expect(await can(author, "update", postsTable, post)).toBe(true);
 * expect(await can(stranger, "update", postsTable, post)).toBe(false);
 * ```
 */
export async function can<T extends Table>(
  user: { id: string },
  action: PolicyAction<T>,
  table: T,
  row: InferSelectModel<T>,
): Promise<boolean> {
  const allowed = await callApp("can", { userId: user.id, action, tableName: getTableName(table), row });

  return allowed === true;
}
