import { and, type InferSelectModel, inArray } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { useDb } from "./client";
import { transactionContext } from "./context";
import type { IdentifiableTable, TableId } from "./find-or-fail";
import { trashedScope } from "./soft-deletes";
import { currentEvent } from "../utils/current-event";

interface Batch {
  ids: Set<unknown>;
  rows: Promise<Map<unknown, unknown>>;
}

const outsideRequest = {};
const batches = new WeakMap<object, Map<PgTable, Batch>>();

function currentScope(): object {
  return transactionContext.getStore() ?? currentEvent() ?? outsideRequest;
}

async function loadRows(table: IdentifiableTable, ids: unknown[]) {
  // drizzle's .from() guard is a conditional type that never resolves for a generic table
  const rows = await useDb()
    .select()
    .from(table as PgTable)
    .where(and(inArray(table.id, ids), trashedScope(table, "exclude")));

  return new Map(rows.map((row) => [row.id, row]));
}

function pendingBatch(table: IdentifiableTable) {
  const scope = currentScope();
  const byTable = batches.get(scope) ?? new Map<PgTable, Batch>();
  const pending = byTable.get(table);

  batches.set(scope, byTable);

  if (pending) return pending;

  const ids = new Set<unknown>();
  const batch: Batch = {
    ids,
    rows: new Promise((resolve) => process.nextTick(resolve)).then(() => {
      byTable.delete(table);
      return loadRows(table, [...ids]);
    }),
  };

  byTable.set(table, batch);

  return batch;
}

/**
 * A batching reader for one table: every `load(id)` made in the same
 * tick runs as one `WHERE id IN (...)` query.
 *
 * Auto-imported on the server. Call `loader(table)` anywhere: loads in
 * one request, or in one transaction, share a batch. `load()` resolves
 * to the row, or `undefined` when no row has that id. A row trashed by
 * {@link softDeletes} counts as missing, as with {@link findOrFail}.
 * Nothing is cached after the batch runs, so a load after a write
 * sees the write.
 *
 * @example
 * ```ts
 * const withAuthors = await Promise.all(
 *   rows.map(async (post) => ({ ...post, author: await loader(userTable).load(post.authorId) })),
 * );
 * ```
 */
export function loader<T extends IdentifiableTable>(table: T) {
  return {
    async load(id: TableId<T>): Promise<InferSelectModel<T> | undefined> {
      const batch = pendingBatch(table);

      batch.ids.add(id);

      // the map holds rows of this table, keyed by their id, which the generic select cannot type
      return (await batch.rows).get(id) as InferSelectModel<T> | undefined;
    },
  };
}
