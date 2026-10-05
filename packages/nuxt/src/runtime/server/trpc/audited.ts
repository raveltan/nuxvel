import { isDeepStrictEqual } from "node:util";
import type { TRPCMiddlewareFunction } from "@trpc/server";
import { getTableName } from "drizzle-orm";
import { actorContext } from "../actions/context";
import type { Actor } from "../actions/system-actor";
import { findRow, type IdentifiableTable, type TableId } from "../database/find-or-fail";
import { transaction } from "../database/transaction";
import { audit } from "../utils/audit";

const IGNORED_COLUMNS = new Set(["createdAt", "updatedAt", "searchVector"]);

function diffRows(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};

  for (const key of Object.keys(after)) {
    if (IGNORED_COLUMNS.has(key)) continue;
    if (!isDeepStrictEqual(before[key], after[key]))
      changes[key] = { from: before[key], to: after[key] };
  }

  return changes;
}

/**
 * tRPC middleware that writes an audit-log row for a mutation, recording
 * a before/after diff of the target row.
 *
 * Auto-imported on the server. Runs the procedure in a transaction, as
 * `ctx.actor`, loads the row whose id is `input.id` before and after,
 * and stores only the columns whose values changed — compared by value,
 * so an untouched date or JSON column is not a change — ignoring
 * `createdAt`, `updatedAt` and the `searchVector` column of
 * `searchable()`. The row's `targetType` is the table's name. Only compiles on an {@link authedProcedure} whose input has an
 * `id` of the target table's id type; goes after `.input(...)`.
 *
 * @param action Dotted action name, e.g. `"post.updated"`.
 * @param opts.target The table whose row is being changed.
 *
 * @example
 * ```ts
 * update: authedProcedure
 *   .input(updatePostInput)
 *   .use(audited("post.updated", { target: postsTable }))
 *   .mutation(({ input, ctx }) => updatePostAction(input, { actor: ctx.actor })),
 * ```
 */
export function audited<T extends IdentifiableTable>(
  action: string,
  opts: { target: T },
): TRPCMiddlewareFunction<{ actor: Actor }, object, object, object, { id: TableId<T> }> {
  const targetType = getTableName(opts.target);

  return ({ ctx, input, next }) =>
    actorContext.run(ctx.actor, () =>
      transaction(async () => {
        const before = await findRow(opts.target, input.id, "include");
        const result = await next();

        if (!result.ok) throw result.error;

        const after = await findRow(opts.target, input.id, "include");

        await audit(
          action,
          { type: targetType, id: input.id },
          { changes: diffRows(before, after) },
        );

        return result;
      }),
    );
}
