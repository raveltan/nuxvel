# Soft deletes

## Introduction

A soft delete keeps the row and sets its `deletedAt` column. The row then counts as trashed, and you can restore it or delete it permanently. Use soft deletes when users must be able to undo a delete. The helpers are auto-imported on the server, but schema files import `softDeletes()`.

## Adding the column

```sh
nuxvel make:schema post title --soft-deletes
```

With `--soft-deletes`, `nuxvel make:schema` adds `...softDeletes()` to the table:

```ts
// server/database/schema/post.schema.ts
import { pgTable, serial, varchar } from "drizzle-orm/pg-core";
import { softDeletes, timestamps } from "@nuxvel/nuxt/database";

export const postTable = pgTable("post", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  ...timestamps(),
  ...softDeletes(),
});

export type PostRow = typeof postTable.$inferSelect;
export type NewPostRow = typeof postTable.$inferInsert;
```

To add soft deletes to a table that exists, add `...softDeletes()` to it yourself. `softDeletes()` adds a nullable `deleted_at` column of type `timestamptz`. A live row has `null` in it. Run `nuxvel db:generate` to add the column with a migration.

With `--soft-deletes`, the `delete` action that `nuxvel make:resource post title` writes trashes the row. The command also writes the `restore` action, mutation and policy rule. See [CLI: make:router](./cli.md#nuxvel-makerouter-name---crud).

## Deleting and restoring

```ts
const [post] = await softDelete(postTable, eq(postTable.id, input.id));

await restore(postTable, eq(postTable.id, input.id));

await forceDelete(postTable, eq(postTable.id, input.id));
```

Each helper takes the table and a `where` condition. It returns the rows that it changed, as `.returning()` does. Each helper joins the active transaction.

| Helper | What it does |
|---|---|
| `softDelete(table, where)` | Sets `deletedAt` to the server's `now()`. It skips rows that are already trashed. |
| `restore(table, where)` | Sets `deletedAt` back to `null`. It skips rows that are not trashed. |
| `forceDelete(table, where)` | Deletes the rows permanently, trashed or not. Foreign keys cascade as usual. |

The helpers accept only a table with `softDeletes()`. Another table fails `nuxt typecheck`.

## Reading live rows

```ts
const rows = await useDb()
  .select()
  .from(postTable)
  .where(and(eq(postTable.authorId, user.id), notTrashed(postTable)));
```

A plain Drizzle query returns trashed rows too. nuxvel does not change your queries. Add `notTrashed(table)` to the `where` of each read that must hide trashed rows. `onlyTrashed(table)` keeps only the trashed rows, for example for a trash page.

nuxvel has no `withoutTrashed(query)` helper. On a `$dynamic()` query, a second `.where()` replaces the first, so the helper would replace your own condition.

## Finding a trashed row

```ts
const post = await findOrFail(postTable, id);
const trashed = await findOrFail(postTable, id, { trashed: "only" });
```

On a table with `softDeletes()`, `findOrFail` treats a trashed row as not found. The `trashed` option changes this:

| `trashed` | Finds the row when it is |
|---|---|
| `"exclude"` | live. This is the default. |
| `"include"` | live or trashed. |
| `"only"` | trashed. |

The option is only for tables with `softDeletes()`. `firstOrFail` takes rows, not a table, so it has no `trashed` option. Put the condition in the query instead.

```ts
// server/actions/posts/restore-post.action.ts
import { eq } from "drizzle-orm";
import { postTable } from "../../database/schema/post.schema";
import { postIdInput } from "../../../shared/schemas/post";

export const restorePostAction = defineAction({
  input: postIdInput,
  handler: async (input, ctx) => {
    const post = await findOrFail(postTable, input.id, { trashed: "only" });
    await authorize(ctx.actor, "restore", postTable, post);

    return restore(postTable, eq(postTable.id, input.id)).then(firstOrFail);
  },
});
```

A restore action finds the trashed row and checks a policy rule, as any other action does. Add a `restore` rule to the [policy](./authorization.md) of the table. To audit the delete and the restore, see [Audit log](./audit.md#soft-deletes-and-restores).

## Unique values

```ts
import { isNull } from "drizzle-orm";
import { pgTable, serial, text, uniqueIndex } from "drizzle-orm/pg-core";
import { softDeletes } from "@nuxvel/nuxt/database";

export const tagTable = pgTable("tag", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  ...softDeletes(),
}, (t) => [uniqueIndex("tag_name_live").on(t.name).where(isNull(t.deletedAt))]);
```

A plain unique constraint also counts trashed rows. To let a new row reuse the value of a trashed row, use a partial unique index. When `restore()` then breaks the index, the call fails with `ConflictError`, as [Database: unique constraints](./database.md#unique-constraints) describes.

## Purging trashed rows

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  nuxvel: {
    database: { purgeTrashedAfter: "30 days" },
  },
});
```

When you set `purgeTrashedAfter`, the built-in `nuxvel.purge-trashed` schedule runs each day at 04:00. It permanently deletes the rows that were trashed longer ago than this time. It does this in each table of `server/database/schema/` that has `softDeletes()`. The schedule runs in `nuxvel queue:work`. See [Queues: schedules](./queues.md#schedules).

- The value is a Postgres interval, such as `"30 days"`, `"12 hours"` or `"2 weeks"`. A value that Postgres cannot read makes the schedule fail.
- Set it in `nuxt.config.ts`. nuxvel adds the schedule at build time.
- Without `purgeTrashedAfter`, nuxvel has no purge schedule and keeps trashed rows until you delete them.
- The purge runs one `DELETE` for each table, so foreign keys cascade.
- The purge does not delete files in storage. For rows that point at stored files, see [Storage: deleting stored files](./storage.md#deleting-stored-files).

```ts
const purged = await purgeTrashed("30 days");
// { post: 3 }
```

`purgeTrashed(after?)` does the same work on demand. It returns the number of rows that each table lost. Without an argument, it uses `purgeTrashedAfter`. When neither is set, it deletes nothing.

## Testing

```ts
import { actingAs, expect, expectRow, expectSoftDeleted } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { postTable } from "../../server/database/schema/post.schema";
import { postFactory } from "../../server/factories/post.factory";
import { userFactory } from "../../server/factories/users.factory";

describe("post.delete", () => {
  it("trashes a post", async () => {
    const author = await userFactory();
    const post = await postFactory.for("authorId", author)();

    await actingAs(author).trpc.post.delete({ id: post.id });

    await expectSoftDeleted(postTable, { id: post.id });
  });
});

describe("post.restore", () => {
  it("restores a trashed post", async () => {
    const author = await userFactory();
    const post = await postFactory.for("authorId", author).trashed()();

    const restored = await actingAs(author).trpc.post.restore({ id: post.id });

    expect(restored.deletedAt).toBeNull();
    await expectRow(postTable, { id: post.id, deletedAt: null });
  });
});
```

`expectSoftDeleted(table, match)` checks that a trashed row matches, and returns it. `factory.trashed()` inserts a trashed row. See [Testing: states](./testing.md#states).

## See also

- [Database](./database.md)
- [Audit log](./audit.md#soft-deletes-and-restores)
- [Authorization](./authorization.md)
- [Privacy](./privacy.md#erasing-a-users-data)
- [Testing](./testing.md)
- [Full-text search](./search.md)
- [CLI: `nuxvel make:resource`](./cli.md#nuxvel-makeresource-name)
