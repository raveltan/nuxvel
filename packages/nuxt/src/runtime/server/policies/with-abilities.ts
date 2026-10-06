import type { Table } from "drizzle-orm";
import { z } from "zod";
import { actorContext } from "../actions/context";
import { currentEvent } from "../utils/current-event";
import { canMany } from "./can";
import type { AbilityRef } from "./define-policy";

interface Batch {
  scope: unknown;
  rows: Record<string, unknown>[];
  answers: Promise<Record<string, boolean>[]>;
}

function batchedCanMany(abilities: readonly AbilityRef[]) {
  let pending: Batch | undefined;

  return async (row: Record<string, unknown>) => {
    const scope = actorContext.getStore() ?? currentEvent();

    if (!pending || pending.scope !== scope) {
      const rows: Record<string, unknown>[] = [];
      const batch: Batch = {
        scope,
        rows,
        answers: new Promise<void>((resolve) => process.nextTick(resolve)).then(() => {
          if (pending === batch) pending = undefined;
          return canMany(abilities, rows);
        }),
      };
      pending = batch;
    }

    const index = pending.rows.push(row) - 1;

    return (await pending.answers)[index];
  };
}

/**
 * Extends a row schema for `.output()` with `can`: whether the current
 * actor may perform each of `abilities` on the row, as
 * `{ update: boolean, delete: boolean }`.
 *
 * Auto-imported on the server. The procedure returns plain rows, and the
 * output schema adds `can` to each. The rows of one response are checked
 * with one {@link canMany} call, so the policy's `preload` runs once for
 * a `paginated()` list as for one row. The rules see the whole row the
 * procedure returns, also the columns the schema leaves out. Reads the
 * ambient actor: the guest in a signed-out request. Pass ability refs of
 * one policy. The client reads `post.can.update`.
 *
 * @example
 * ```ts
 * byId: publicProcedure
 *   .input(postIdInput)
 *   .output(withAbilities(postSchema, [$policies.post.update, $policies.post.delete]))
 *   .query(({ input }) => findOrFail(postTable, input.id)),
 * list: publicProcedure
 *   .input(paginationSchema)
 *   .output(paginated(withAbilities(postSchema, [$policies.post.update])))
 *   .query(({ input }) => paginate(useDb().select().from(postTable).orderBy(postTable.id).$dynamic(), input)),
 * ```
 */
export function withAbilities<Shape extends z.core.$ZodShape, Config extends z.core.$ZodObjectConfig, Rule extends string>(
  schema: z.ZodObject<Shape, Config>,
  abilities: readonly AbilityRef<Table, Rule>[],
) {
  const check = batchedCanMany(abilities);
  const withCan = schema.extend({ can: z.record(z.enum(abilities.map((ability) => ability.rule)), z.boolean()) });

  return z.preprocess(async (row: z.input<typeof schema>) => ({ ...row, can: await check(row) }), withCan);
}
