# Backfills

## Introduction

A backfill is a data migration that you can stop and start again. It reads a table in primary-key order, one batch at a time, and records how far it got. Use a backfill to fill a new column from existing rows. It does not hold a long lock, and you can interrupt it at any time.

## Generating a backfill

```sh
nuxvel make:backfill posts-content --table post
```

This command writes two files:

- `server/database/backfills/posts-content.backfill.ts`, which exports `postsContentBackfill`, with a handler that logs the size of each batch.
- `server/database/backfills/posts-content.backfill.test.ts`, a functional test that runs the backfill to completion. See [Testing](#testing).

`--table` is the name of a schema file under `server/database/schema/`. Add `--force` to overwrite files that already exist.

## Defining a backfill

```ts
// server/database/backfills/posts-content.backfill.ts
import { eq, isNull } from "drizzle-orm";
import { postTable } from "../schema/post.schema";

export const postsContentBackfill = defineBackfill({
  table: postTable,
  batchSize: 1_000,
  where: isNull(postTable.content),
  async handler(rows) {
    for (const row of rows) {
      await useDb().update(postTable).set({ content: row.body }).where(eq(postTable.id, row.id));
    }
  },
});
```

This backfill copies `body` into a new `content` column. Put one backfill in each file under `server/database/backfills/`. nuxvel finds the file. You do not register it. `defineBackfill` is auto-imported.

| Option | Description |
|---|---|
| `table` | The Drizzle table to read. It needs a single-column primary key. |
| `batchSize` | The number of rows each batch gives to `handler`. It must be a positive integer, or the backfill throws when its file loads. |
| `where` | Optional. The backfill reads only the rows that match this condition. |
| `handler` | The work for one batch. `useDb()` inside it joins the transaction of that batch. |

## Backfill names

The name of a backfill is its path under `server/database/backfills/`. A `.` joins the folder names:

| File | Name |
|---|---|
| `server/database/backfills/posts-content.backfill.ts` | `"posts-content"` |
| `server/database/backfills/posts/content.backfill.ts` | `"posts.content"` |

The auto-imported `$backfills` namespace holds each backfill under its path. Each path segment is in camelCase and has no kind suffix. `$backfills.posts.content` is the backfill in `server/database/backfills/posts/content.backfill.ts`. Go to definition on `$backfills.posts.content` opens the backfill file. `$backfills` is available on the server only.

`runBackfill()`, the test fixture and `nuxvel backfill:status` use this name. nuxvel also stores the cursor under it. See [Names come from paths](./index.md#names-come-from-paths).

## Running a backfill

```ts
await runBackfill("posts-content");
await runBackfill($backfills.postsContent);
```

`runBackfill` is auto-imported on the server. Call it from a job, a Nitro task or `nuxvel tinker`. The name is typed from `server/database/backfills/`, so a misspelled name fails `nuxt typecheck`. A name that no backfill has throws at runtime. In place of the name, `runBackfill` also takes the definition, from `$backfills` or an import. Go to definition on the argument opens the file of the backfill.

Each batch runs in its own transaction, together with the update to the cursor. A crash or a deploy during a run loses only the current batch. The next run continues after the last committed batch.

- When the handler throws, its batch rolls back and `runBackfill` throws the same error. The cursor stays where it was.
- When two runs of the same backfill occur at the same time, they take turns batch by batch. They do not process a row twice.
- When the backfill is complete, a new run does nothing.

## Progress

```ts
// server/database/schema/backfills.schema.ts
import { now } from "@nuxvel/nuxt/database";

export const backfillsTable = pgTable("backfills", {
  name: text("name").primaryKey(),
  cursor: jsonb("cursor"),
  processed: integer("processed").notNull().default(0),
  total: integer("total").notNull(),
  completedAt: timestamp("completed_at"),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$defaultFn(now),
});
```

nuxvel keeps the progress of each backfill in the `backfills` table. A new app has this schema file.

| Column | Value |
|---|---|
| `name` | The name of the backfill. |
| `cursor` | The primary key of the last row in the last committed batch. |
| `processed` | The number of rows processed. |
| `total` | The number of rows that matched `where` when the backfill first started. |
| `completedAt` | The time the backfill completed, or `null`. |

## Checking progress

```sh
nuxvel backfill:status
# NAME           ROWS       CURSOR  STATE
# posts-content  2000/5120  2000    in progress
```

`nuxvel backfill:status` shows each backfill that has started: the rows processed out of the total, the cursor, and the state (`in progress` or `done`). Add `--json` to get the same data as JSON.

## Fresh databases

A contract migration with `-- nuxvel:requires-backfill=<name>` waits until that backfill completed. A database with no applied migration, such as a new test database or a new environment, has no rows to fill. There the migration runs at once, right after its expand migration. A database with at least one applied migration always waits for the backfill.

## Renaming a backfill

```ts
// server/database/backfills/posts-content.backfill.ts
import { postsContentBackfill } from "./posts/content.backfill";

export default renamed(postsContentBackfill);
```

When you move a backfill file, its name changes, and a new run starts from the beginning. To keep the stored cursor, leave `renamed()` at the old path. The backfill then continues from the cursor stored under the old name. See [Renaming a definition](./index.md#renaming-a-definition).

## Testing

```ts
// server/database/backfills/posts-content.backfill.test.ts
import { expect, expectRow, runBackfill } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { backfillsTable } from "../schema/backfills.schema";

describe("posts-content backfill", () => {
  it("runs to completion over every matching row", async () => {
    await runBackfill("posts-content");

    const state = await expectRow(backfillsTable, { name: "posts-content" });
    expect(state.completedAt).toBeInstanceOf(Date);
    expect(state.processed).toBe(state.total);
  });
});
```

`runBackfill` from `@nuxvel/nuxt/testing` runs the backfill in the app under test. When a batch throws, it rejects with the error of the handler, after that batch rolls back. This is the test that `nuxvel make:backfill` generates. It also takes the stub from `$backfills` in `#nuxvel/test-namespaces` in place of the name.

## See also

- [Database](./database.md)
- [Queues](./queues.md)
- [CLI](./cli.md)
- [Testing](./testing.md)
