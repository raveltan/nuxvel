# Database

## Introduction

nuxvel stores data in Postgres and queries it with Drizzle ORM. You define tables in schema files, generate migrations from them, and query through `useDb()`. Seeders fill a development database with data. Every helper on this page is auto-imported on the server. Schema files are the exception: `drizzle-kit` loads them outside Nuxt, so they import what they use.

## Configuration

```
NUXT_DATABASE_URL=postgres://nuxvel:nuxvel@localhost:5432/nuxvel
NUXT_DATABASE_OWNER_URL=postgres://nuxvel:nuxvel@localhost:5432/nuxvel
```

The app uses two connection strings:

| Variable | Used by |
|---|---|
| `NUXT_DATABASE_URL` | The running app. `useDb()` connects with it. |
| `NUXT_DATABASE_OWNER_URL` | Owner-level work: `nuxvel db:migrate`, the [release entries](./build.md#release-entries) and the test database setup. |

The server does not start when `NUXT_DATABASE_URL` is not set. If you call `useDb()` without it, `useDb()` throws on first use.

Each server process opens at most 10 connections. Set `NUXT_DATABASE_POOL_MAX` to change that, for example when many processes share one Postgres. On a VPS, [the deploy](./deploy.md#app-processes) sets it.

Postgres stops a statement of the app that runs for more than 15 seconds, and closes a connection that stays idle in a transaction for more than 30 seconds. A connection attempt stops after 5 seconds. So a small number of slow queries cannot use all the connections of the pool. These limits apply to `useDb()`, so also to jobs, seeders and backfills. `nuxvel db:migrate` and the release entries use their own connection, see [Migrations](#migrations).

To change a limit for the full app, add it to the query of `NUXT_DATABASE_URL`, for example `?statement_timeout=60s`. The value in the URL wins. To give one query more time, set a local limit in its transaction:

```ts
await transaction(async () => {
  await useDb().execute(sql`set local statement_timeout = '5min'`);
  await useDb().execute(sql`refresh materialized view post_stats`);
});
```

`NUXT_DATABASE_OWNER_URL` is for tools only. Code under `server/**` must never read it. When it is not set, `nuxvel db:migrate` uses `NUXT_DATABASE_URL`.

## Defining a table

```sh
nuxvel make:schema post title body:text author:references=user
```

`nuxvel make:schema` writes a table file from a list of fields. Each field is `name[:type[=arg]][:modifier...]`, and the type is `string` if you do not write it. See [CLI: fields](./cli.md#fields). The command above writes this file:

```ts
// server/database/schema/post.schema.ts
import { index, pgTable, serial, text, varchar } from "drizzle-orm/pg-core";
import { belongsTo, timestamps } from "@nuxvel/nuxt/database";
import { userTable } from "./auth.schema";

export const postTable = pgTable("post", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body").notNull(),
  authorId: belongsTo(userTable),
  ...timestamps(),
}, (table) => [index("post_author_id_idx").on(table.authorId)]);

export type PostRow = typeof postTable.$inferSelect;
export type NewPostRow = typeof postTable.$inferInsert;
```

It also writes the Zod inputs and the row schema `postSchema` of the table to `shared/schemas/post.ts`. See [Validation](./validation.md#defining-a-schema). Then run `nuxvel db:generate` to write the migration. See [Migrations](#migrations).

A schema file is a plain Drizzle file. You can write it yourself or change the generated file, for example to add a column later. Put each table group in its own file under `server/database/schema/`. nuxvel finds the file. You do not register it.

Each export name tells its kind. A table export ends in `Table`, for example `postTable`. A row type ends in `Row`: `PostRow` is `typeof postTable.$inferSelect` and `NewPostRow` is `typeof postTable.$inferInsert`. A Zod input in `shared/schemas/` ends in `Input`, for example `createPostInput`. A Zod schema of an output shape keeps the `Schema` suffix: `postSchema` is the row, and `z.infer<typeof postSchema>` is `PostRow`. The SQL name in `pgTable()` does not change. See [Validation: naming](./validation.md#naming).

`timestamps()` adds `created_at` and `updated_at` columns. Both are `NOT NULL DEFAULT now()`. On an insert, Drizzle sets both columns from the server's [`now()`](#the-current-time). Drizzle sets `updatedAt` again on every update.

Server code reads every table from `#nuxvel/schema`. All `#nuxvel/*` modules are server-only. A value import from a page or a component fails the build, so server code never ships to the browser. A type-only import (`import type`) works.

### Foreign key indexes

```sh
nuxvel make:schema comment post:references body:text
```

```ts
// server/database/schema/comment.schema.ts
import { index, pgTable, serial, text } from "drizzle-orm/pg-core";
import { belongsTo, timestamps } from "@nuxvel/nuxt/database";
import { postTable } from "./post.schema";

export const commentTable = pgTable("comment", {
  id: serial("id").primaryKey(),
  postId: belongsTo(postTable),
  body: text("body").notNull(),
  ...timestamps(),
}, (table) => [index("comment_post_id_idx").on(table.postId)]);
```

Postgres does not index a foreign key column. Without an index, a query for the comments of a post reads the whole table, and a delete of a post does the same to find its comments. Give each foreign key an index that starts with its columns. `nuxvel db:check` fails when one has none. The tables that `nuxvel make:router --crud` and `nuxvel make:resource` write already have the index. So does each `references` field of `nuxvel make:schema`.

When a foreign key does not need an index, list it with the reason:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  nuxvel: {
    database: {
      unindexedForeignKeys: { "post.editor_id": "Few posts have an editor, and editors are never deleted" },
    },
  },
});
```

A key is `<table>.<column>`. For a foreign key on more than one column, join the columns with commas. See the [CLI reference](./cli.md#nuxvel-dbcheck).

### Foreign keys with `belongsTo()`

`belongsTo(table)` writes a foreign key column to the `id` of `table`:

```ts
// server/database/schema/comment.schema.ts
import { index, pgTable, serial, text } from "drizzle-orm/pg-core";
import { belongsTo, timestamps } from "@nuxvel/nuxt/database";
import { postTable } from "./post.schema";
import { userTable } from "./auth.schema";

export const commentTable = pgTable("comment", {
  id: serial("id").primaryKey(),
  postId: belongsTo(postTable),
  editorId: belongsTo(userTable, { nullable: true, onDelete: "set null" }),
  body: text("body").notNull(),
  ...timestamps(),
}, (table) => [index("comment_post_id_idx").on(table.postId), index("comment_editor_id_idx").on(table.editorId)]);
```

`postId: belongsTo(postTable)` is the same column as `postId: integer("post_id").notNull().references(() => postTable.id, { onDelete: "cascade" })`, so changing one into the other needs no migration. The column has the type of the parent's `id` (`text`, `uuid`, or `integer` for a `serial`). Its name is the key in snake_case.

| Option | Default | |
|---|---|---|
| `column` | the key in snake_case | the SQL name of the column |
| `onDelete` | `"cascade"` | what a delete of the parent row does |
| `nullable` | `false` | `true` drops `NOT NULL` |

`belongsTo()` adds no index. Keep the `index(...)` line. It reads the parent table when the schema loads, so a table that references itself keeps the hand-written `.references(() => ...)`. A factory creates the parent row of a `belongsTo()` column when a test gives none. See [Testing: factories](./testing.md#factories).

### The current time

```ts
const commentsClosed = post.commentsCloseAt <= now();
```

`now()` returns the current time as a `Date`. It is auto-imported on the server. Use it instead of `new Date()` or `Date.now()`, so that the [test clock](./testing.md#controlling-time) can move it.

In a schema file, import it from `@nuxvel/nuxt/database` and add it to a `defaultNow()` column: `timestamp("sent_at").notNull().defaultNow().$defaultFn(now)`. The database default stays, and Drizzle fills the column from `now()` on insert. The migration does not change.

## Migrations

```bash
nuxvel db:generate
nuxvel db:migrate
```

After you change a schema file, run `nuxvel db:generate`. It passes its arguments to `drizzle-kit generate`. It writes SQL to the `out` folder in `drizzle.config.ts`, which is `server/database/migrations` in a new app. Then run `nuxvel db:migrate` to apply every pending migration.

Commit the generated SQL and the `meta/` folder next to it.

`nuxvel dev` does not start when a migration is pending. If you change the schema while the dev server runs, a query can use a table or a column that is not in the database. Postgres then gives the error `42P01` (no table) or `42703` (no column). In development, the error line in the terminal and the `error` line in [DevTools](./devtools.md#find-an-error-by-its-request-id) then have a `hint` field. The terminal shows it on its own line after the error line:

```
The database tables do not match the schema of the app. If you changed the schema, run nuxvel db:generate. Then run nuxvel db:migrate.
```

A production build does not add the hint.

Do not edit or regenerate a migration after it ran. The migrations table records the SHA-256 of each file and the time in `meta/_journal.json`. Before it applies a migration, `db:migrate` compares each migration that ran with its file. It stops when a file changed, or when the journal does not have a migration that ran:

```
✖ 0016_webhook-endpoints changed after it ran on this database
  → Restore the file and put the change in a new migration, or rebuild a dev database with nuxvel db:fresh
```

Put a change to a table in a new migration. On a development database, `nuxvel db:fresh` also works: it drops the tables and applies every migration again. A database that ran a migration of another branch gets the same error.

### Migrations from two branches

`nuxvel db:generate add-post-slug` names the migration `0031_add-post-slug`. The number only sorts the files. `db:migrate` applies each migration that has a later time in `meta/_journal.json` than the last migration that ran. When two branches each generate a migration, both get the same number, and `meta/_journal.json` has a merge conflict. Keep the version of the main branch, delete the SQL file and the snapshot of your migration, and run `nuxvel db:generate` again. Do not keep both entries: when the other migration already ran, `db:migrate` skips yours. `nuxvel db:check` fails on such a merge:

```
0031_add-post-slug:
✖ Generated before 0031_tags, which comes first: a database that applied 0031_tags skips it
  → Delete this migration and its snapshot, then run nuxvel db:generate again on top of the migrations it now follows
```

Each migration runs in its own transaction. `db:migrate` waits at most 5 seconds for a lock and tries 3 more times, and a statement may run for 15 minutes. A `lock_timeout` or `statement_timeout` in the database URL wins.

### Indexes on existing tables

`CREATE INDEX` locks writes to the table while it builds. On a table that already holds rows, build the index concurrently, in a migration of its own with one statement. `nuxvel db:generate` does this for you. When a new migration creates an index on a table that the migration does not create, it moves the index into a migration of its own, named `<name>-index`:

```sql
-- server/database/migrations/0027_posts-title-index.sql
-- nuxvel:no-transaction
CREATE INDEX CONCURRENTLY "posts_title_idx" ON "posts" USING btree ("title");
```

A file with the `-- nuxvel:no-transaction` line runs outside a transaction. When a concurrent build fails, it leaves an invalid index behind. The next run drops it first. `nuxvel db:check` fails on a `CREATE INDEX` without `CONCURRENTLY` on a table the migration does not create. To write such a migration by hand, start from an empty one: `nuxvel db:generate --custom --name=posts-title-index`.

### Contract migrations

A contract migration removes what the running release may still read: a dropped or renamed column, a changed type. It lives in `server/database/migrations/contract/<name>.sql`, where `<name>` is the migration it belongs to, and runs after the other migrations. `nuxvel db:generate` moves these statements there for you, and `nuxvel db:check` fails on one left in another migration.

A migration that drops a constraint or an index and creates it again with the same name, for example to change `onDelete`, keeps the drop. The old release still works with the new constraint or index, and the create fails while the old one exists. So `db:generate` does not move that drop, and `db:check` accepts it.

```sql
-- server/database/migrations/contract/0026_posts-drop-summary.sql
ALTER TABLE "posts" DROP COLUMN "summary";
```

`nuxvel db:migrate` applies it right away. A deploy applies it only once no release that reads the column runs. See [Deploying](./deploy.md).

On a database with no applied migration, such as a new test database, each contract migration runs right after its own migration, not after all of them. So a later migration can create again a column that a contract migration drops.

When the contract migration needs a [backfill](./backfills.md) to finish first, name it:

```sql
-- nuxvel:requires-backfill=copy-post-summaries
ALTER TABLE "posts" DROP COLUMN "summary";
```

The migration waits until the backfill completed. `db:migrate` lists it as deferred until then.

### Running the migrations from code

`runMigrations()` from `@nuxvel/nuxt/migrations` is the migrator that `db:migrate` and the test setup use. `contract: true` also applies every contract migration. It throws before it applies a migration when a migration that ran changed. `changedMigrations()` returns these changes, one sentence for each migration, without applying anything.

```ts
import { changedMigrations, runMigrations } from "@nuxvel/nuxt/migrations";

await runMigrations(sql, { migrationsFolder: "server/database/migrations", contract: true });

const changes = await changedMigrations(sql, { migrationsFolder: "server/database/migrations" });
```

To undo the last migration during development, write its SQL in reverse in `server/database/migrations/down/<name>.sql` and run `nuxvel db:rollback`. See the [CLI reference](./cli.md#nuxvel-dbrollback).

To look at the tables and rows in a browser, run `nuxvel db:studio`. It opens [Drizzle Studio](./cli.md#nuxvel-dbstudio) on your schema and `NUXT_DATABASE_URL`.

Tests need no migration step. The test setup creates a new database and migrates it before the suite runs. In production, [`nuxvel deploy`](./deploy.md) runs the migrations before it starts the new release, and applies the contract migrations only when no older release runs. Do not run `nuxvel db:migrate` against a production database: it applies the contract migrations at once. See [Building for production](./build.md) and the [CLI reference](./cli.md#nuxvel-dbmigrate).

## Querying

```ts
const rows = await useDb().select().from(postTable);

const post = await useDb()
  .insert(postTable)
  .values({ title: "Hello", body: "First post", authorId: user.id })
  .returning()
  .then(firstOrFail);
```

`useDb()` returns the Drizzle client, typed against your schema. Inside a transaction it returns that transaction. Outside a transaction it returns the connection pool. You do not pass a `tx` argument through your code.

### Taking one row

```ts
const newest = await useDb()
  .select()
  .from(postTable)
  .orderBy(desc(postTable.createdAt))
  .limit(1)
  .then(firstOrFail);
```

`.returning()` and `select()` give an array. `firstOrFail` takes the first row from any row array. When the array is empty, it throws `NotFoundError` (HTTP 404).

### Finding a row by ID

```ts
const post = await findOrFail(postTable, id);
```

`findOrFail` loads one row by its `id` column. When no row matches, it throws `NotFoundError` (HTTP 404). The type of `id` comes from the table's `id` column. It is a number for a `serial` key and a string for a `text` key, such as Better Auth's `user.id`. On a table with `softDeletes()`, a trashed row counts as not found. See [Soft deletes: finding a trashed row](./soft-deletes.md#finding-a-trashed-row).

### Writing one row

```ts
const post = await insertOne(postTable, { title: "Hello", body: "First post", authorId: user.id });
const renamed = await updateOne(postTable, post.id, { title: "Hello again" });
```

`insertOne(table, values)` inserts one row and returns it. `updateOne(table, id, values)` updates the row with that `id` and returns it. When no row has that `id`, `updateOne` throws `NotFoundError` (HTTP 404). On a table with `softDeletes()`, a trashed row counts as not found. Both are auto-imported on the server, and both join the transaction, like `useDb()`.

`values` is what Drizzle's `.values()` and `.set()` take. For several rows, an upsert or a `WHERE` other than the `id`, write the Drizzle chain.

### Unique constraints

```ts
await useDb().insert(tagTable).values({ name: "nuxt" });
```

When a write breaks a unique constraint, Postgres rejects it with code `23505`. Code that catches the error from the write sees that Postgres error. When the error leaves an action, a tRPC procedure or a server route, nuxvel changes it to `ConflictError` (HTTP 409).

When the constraint covers one column, `error.field` names that column by its schema name, for example `name`. The client gets it as a [field error](./validation.md#error-shape).

## Pagination

```ts
// server/trpc/routers/post.router.ts
import { desc, ilike } from "drizzle-orm";
import { z } from "zod";
import { postTable } from "#nuxvel/schema";

export const postRouter = {
  list: publicProcedure
    .input(paginationSchema.optional())
    .output(
      z.object({
        rows: z.array(postSchema),
        page: z.number(),
        perPage: z.number(),
        total: z.number(),
        lastPage: z.number(),
      }),
    )
    .query(({ input }) =>
      paginate(
        useDb()
          .select()
          .from(postTable)
          .where(input?.q ? ilike(postTable.title, `%${input.q}%`) : undefined)
          .orderBy(desc(postTable.createdAt), desc(postTable.id))
          .$dynamic(),
        input,
      ),
    ),
};
```

`paginate(query, { page, perPage })` runs one page of a select. Pass the query with `.$dynamic()`, and without `.limit()` or `.offset()`. Give it an `.orderBy()` that ends on a unique column, so that a row stays on one page.

It returns a `Paginated<Row>` object:

| Field | Value |
|---|---|
| `rows` | the rows of this page |
| `page` | the page number, from 1 |
| `perPage` | the most rows a page holds |
| `total` | the number of rows on all pages |
| `lastPage` | the number of the last page, 1 when there are no rows |

`paginated(rowSchema)` gives the Zod schema of this object. Use it as the `.output()` of a procedure that returns `paginate()`. The client then gets the row type of the schema, and the [OpenAPI document](./openapi.md#the-openapi-document) shows the page shape:

```ts
list: publicProcedure
  .input(paginationSchema.optional())
  .output(paginated(postSchema))
  .query(({ input }) => paginate(useDb().select().from(postTable).orderBy(desc(postTable.id)).$dynamic(), input)),
```

`paginate` makes `page` at least 1. `perPage` is 20 when you do not set it, and it stays between 1 and 100. A page that is not full gives the total, so `paginate` runs one query. A full or empty page needs a second query that counts the rows. Both queries use the current transaction.

`paginationSchema` is the input of a paginated list: an optional `page`, `perPage` and `q`. It trims `q` and changes numeric strings to numbers. A `q` of more than 200 characters fails validation. `paginate` does not read `q`. Use it in your `.where()`, as the example does. `ilike` reads `%` and `_` in `q` as wildcards. Put a backslash before them to match them as text. For a search by words, use [full-text search](./search.md#with-pagination) in place of `ilike`.

`paginationSchema`, its input type `PaginationInput`, `paginated` and the type `Paginated` are auto-imported on the server and in the app. To show a paginated query in a table, see [Frontend: data tables](./frontend.md#data-tables).

### Sorting and filtering

```ts
// shared/schemas/task.ts
export const taskListColumns = {
  sort: ["id", "title", "dueOn", "createdAt"],
  filters: { title: "text", status: ["open", "done"], urgent: "boolean", dueOn: "dateRange" },
} as const;

export const taskListInput = listQuery(taskListColumns);
```

```ts
// server/trpc/routers/task.router.ts
list: publicProcedure
  .input(taskListInput)
  .output(paginated(taskSchema))
  .query(({ input }) =>
    paginate(
      useDb()
        .select()
        .from(taskTable)
        .where(listWhere(taskTable, input.filters))
        .orderBy(...listOrderBy(taskTable, input.sort), desc(taskTable.id))
        .$dynamic(),
      input,
    ),
  ),
```

`listQuery({ sort, filters })` is the input of a list that sorts and filters on the server. It adds `sort` and one key per filter to `page`, `perPage` and `q`. The input is flat, so the same object is a page's `route.query`, the tRPC input and the REST query string:

```
?sort=title:asc,createdAt:desc&status=open,done&urgent=true&dueOn=2026-01-01..2026-01-31&title=report
```

| Filter | Input | Matches |
| --- | --- | --- |
| `"text"` | `title=report` | the column as text, anywhere, without case |
| `"boolean"` | `urgent=true` | `true` or `false` |
| `"dateRange"` | `dueOn=2026-01-01..2026-01-31` | dates from and to, both included; either end may be left out |
| `["open", "done"]` | `status=open,done` | any of the values |

`sort` takes up to three columns, each with `:asc` (the default) or `:desc`. A column that is not in `sort`, a value that is not allowed, or a malformed date fails validation. A filter key may not be `page`, `perPage`, `q`, `sort` or `edit`. The input parses to `{ page, perPage, q, sort, filters }`, with `sort` as `{ column, direction }` terms.

`listWhere(table, input.filters)` gives the `where` condition of the active filters, or `undefined` when none is set, so combine it with `and()`. `listOrderBy(table, input.sort)` gives the order terms. End the `orderBy` with a unique column. A filter or sort key that is not a column of the table is a type error. `listQueryParams(query)` turns a parsed query back into the flat input.

`listQuery`, `listQueryParams` and the types `ListQuery`, `ListSort`, `ListFilterKind` and `ListFilters` are auto-imported on the server and in the app. `listWhere` and `listOrderBy` are auto-imported on the server. `make:router --crud` writes `<name>ListColumns` and `<name>ListInput` for you. `<DataTable>` shows the sort and the filters when you pass it `<name>ListColumns`, see [Frontend: data tables](./frontend.md#data-tables).

### Cursor pagination

```ts
// server/trpc/routers/post.router.ts
import { z } from "zod";
import { postTable } from "#nuxvel/schema";

export const postRouter = {
  feed: publicProcedure
    .input(z.object({ cursor: z.number().int().nullish(), limit: z.number().int().optional() }).optional())
    .output(z.object({ rows: z.array(postSchema), nextCursor: z.number().nullable() }))
    .query(({ input }) =>
      paginateCursor(useDb().select().from(postTable).where(notTrashed(postTable)).$dynamic(), {
        orderBy: "id",
        direction: "desc",
        cursor: input?.cursor,
        limit: input?.limit,
      }),
    ),
};
```

`paginateCursor(query, { orderBy, cursor, limit, direction })` runs one page of a select by key. It returns the rows after `cursor` and a `nextCursor`. To get the next page, send `nextCursor` back as `cursor`. Use it for a feed or an infinite scroll. A page does not move when rows are added before it, and it needs no count.

Pass the query with `.$dynamic()`, and without `.orderBy()`, `.limit()` or `.offset()`. `orderBy` is the key of a selected column with unique values, such as `id`. `direction` is `"asc"` when you do not set it. `limit` is 20 when you do not set it, and it stays between 1 and 100. The query uses the current transaction.

It returns a `CursorPage<Row, Cursor>` object:

| Field | Value |
|---|---|
| `rows` | the rows of this page |
| `nextCursor` | the `cursor` of the next page, `null` on the last page |

`paginateCursor` is auto-imported on the server. The type `CursorPage` is auto-imported on the server and in the app. Use [`paginate()`](#pagination) when you need page numbers and a total.

## Transactions

```ts
await transaction(async () => {
  await useDb().insert(postTable).values(post);

  await addTags(post.id, tags);

  throw new Error("rollback");
});
```

`transaction(fn)` runs `fn` in one database transaction. Every `useDb()` call inside `fn` joins it, also in functions that `fn` calls, such as `addTags` above. When `fn` throws, the transaction saves nothing that `fn` wrote.

`fn` also gets the transaction as its `tx` argument. Use it if you want to write through it directly.

A nested `transaction()` call becomes a savepoint. When the outer code catches the error of an inner call, only the inner work rolls back. The outer transaction continues.

`useDb().transaction(fn)` is the same function, so it also joins an active transaction.

Actions already run in a transaction. Call `transaction()` only for work outside an action.

### Isolation level

```ts
await transaction(async () => {
  await publishScheduledPosts();
}, { isolationLevel: "serializable" });
```

The second argument sets the isolation level, access mode and deferrability of the transaction. A nested call ignores it.

### Bypassing the transaction

```ts
useDb({ root: true });
```

`useDb({ root: true })` returns the pool and ignores any active transaction. Use it only for a write that must stay when the surrounding transaction rolls back. A `transaction()` on this client starts a new, separate transaction.

## After the commit

```ts
await transaction(async () => {
  await useDb().insert(postTable).values(input);

  await onCommit(() => cacheForget("posts:list"));
});
```

`onCommit(fn)` runs `fn` after the surrounding transaction commits. When the transaction rolls back, `fn` does not run. Use it for side effects, such as a cache purge or a call to another service.

- A hook in a nested transaction waits for the outermost commit.
- `transaction()` runs the hooks in order, and waits for them before it returns.
- A hook that throws cannot undo the commit, so the transaction does not fail. nuxvel logs the error and sends it to [error tracking](./observability.md#error-tracking). The next hooks still run.
- Outside a transaction, `fn` runs immediately. `await onCommit(fn)` waits for `fn` and throws what `fn` throws.

For queued work, use [`$jobs.<name>.dispatch()`](./queues.md#dispatching). It writes an outbox row in the same transaction. A channel event from [`$channels.<name>.broadcast()`](./realtime.md#broadcasting-after-the-commit) also waits for the commit.

### Before the commit

```ts
await beforeCommit(() => useDb().update(postTable).set({ title: finalTitle }).where(eq(postTable.id, post.id)));
```

`beforeCommit(fn)` runs `fn` inside the transaction, immediately before it commits. Use it for a write that must be part of the transaction but that you can only prepare after the transaction body finishes. When `fn` throws, the transaction rolls back. Outside a transaction, `fn` runs immediately. `dispatch()` writes its outbox row this way.

## Soft deletes

```ts
export const postTable = pgTable("post", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  ...timestamps(),
  ...softDeletes(),
});
```

```ts
const post = await softDelete(postTable, input.id);
await restore(postTable, input.id);
```

`softDeletes()` adds a `deleted_at` column. A soft delete sets it and keeps the row. `softDelete()`, `restore()` and `forceDelete()` take an `id` and return the row, or throw `NotFoundError`. They also take a `where` condition and return the rows that they changed. See [Soft deletes](./soft-deletes.md).

## Repeated queries (N+1)

```
12:03:44 WARN  db  N+1 suspected in GET /api/posts (23 × the same query)
  select "id", "name" from "user" where "user"."id" = $1
  at server/api/posts.get.ts:14
  Load the rows in one query (a `with:` relation or `inArray`), or wrap it in allowRepeatedQueries(reason, fn)
```

In development, nuxvel counts the queries of each request, job run and command. When one of them runs the same statement 5 times or more, the dev server logs a `db` warning. It logs one warning for each statement. A query for each row in a loop causes this.

Load the related rows together with the list:

```ts
const rows = await useDb().query.postTable.findMany({ with: { author: true } });
```

### Batching loads

```ts
const withAuthors = await Promise.all(
  rows.map(async (post) => ({ ...post, author: await loader(userTable).load(post.authorId) })),
);
```

`loader(table)` batches reads by `id`. Every `load(id)` made in the same tick runs as one `WHERE id IN (...)` query. Loads in one request, or in one transaction, share a batch. `loader` is auto-imported on the server.

`load()` resolves to the row, or to `undefined` when no row has that `id`. A trashed row counts as missing. The type of `id` comes from the table's `id` column, as with `findOrFail`. Nothing is kept after the batch runs, so a load after a write sees the write.

Loads batch only when they start before any of them finishes. Start them together with `Promise.all`. A `for` loop with `await` in each step runs one query per step.

### Walking a large table

```ts
await chunkById(postTable, 500, async (rows) => {
  await reindex(rows);
}, { where: notTrashed(postTable) });
```

`chunkById(table, size, fn, opts?)` reads `size` rows at a time, in `id` order, and calls `fn` with each chunk. Use it in a job or a listener that reads more rows than fit in memory. `chunkById` is auto-imported on the server.

Each chunk starts after the last `id` of the previous chunk. Rows that change during the walk do not shift the chunks. `opts.where` restricts the walk to matching rows. Trashed rows are included unless `where` excludes them. `fn` runs in the caller's transaction, if there is one. For a data migration that must resume after a crash, use a [backfill](./backfills.md) instead.

### Intentional repetition

When the repetition is intentional, wrap the code and give the reason. The queries inside do not cause a warning:

```ts
await allowRepeatedQueries("each row calls a different external API", () => importRows(rows));
```

The [DevTools SQL section](./devtools.md#sql) shows the queries and their timings, and the reason next to the queries it covers.

### Repeated queries in production

```json
{"level":"warn","tag":"db","msg":"n_plus_one_suspected in GET /api/posts (23 × the same query)","route":"GET /api/posts","fingerprint":"select \"id\", \"name\" from \"user\" where \"user\".\"id\" = ?","count":23}
```

A production server counts the statements of each request too. When a request runs the same statement 5 times or more, the server logs one `db` warning named `n_plus_one_suspected`. The line holds the route, the statement with its values replaced by `?` and the count. The request still answers as usual.

The server logs a route and statement pair at most once an hour. Code inside `allowRepeatedQueries()` logs nothing. Production does not time queries.

## Seeding

```bash
nuxvel make:seeder posts
```

`nuxvel make:seeder posts` writes `server/seeders/posts.seeder.ts` with an empty seeder. Fill it with rows from your [factories](./testing.md#factories):

```ts
// server/seeders/posts.seeder.ts
import { faker } from "@faker-js/faker";
import { postFactory, userFactory } from "#nuxvel/factories";

export const postsSeeder = defineSeeder(async () => {
  const ada = await userFactory({ name: "Ada Lovelace", email: "ada@example.com" });
  await postFactory.for("authorId", ada)({ title: "Hello" });
  await postFactory.for("authorId", ada).count(5)();

  await userFactory
    .state({ name: () => faker.person.fullName() })
    .has(3, (author) => postFactory.for("authorId", author))
    .count(4)();
});
```

The factories give each row [Faker](https://fakerjs.dev) values, so the seeded posts look like real content. A value in the call, such as `title: "Hello"`, replaces the Faker value. `factory.state()` changes a value for every row of that factory. Here, each of the four authors gets a Faker name, not the fixed name of the starter's `userFactory`. That factory makes the email from the name, so the emails agree with the names. `.has(3, ...)` gives each author three posts. See [Testing: factories](./testing.md#factories).

A seeder fills the database with development or demo data. Put one seeder in each file under `server/seeders/`. nuxvel finds the file. The path of the file is the name of the seeder: `server/seeders/posts.seeder.ts` is the seeder `"posts"`, and `server/seeders/blog/tags.seeder.ts` is `"blog.tags"`. `defineSeeder` is auto-imported.

The `$seeders` namespace holds each seeder under its path. Import it with `import * as $seeders from "#nuxvel/seeders-namespace"`. Each path segment is in camelCase and has no kind suffix. `$seeders.blog.tags` is the seeder in `server/seeders/blog/tags.seeder.ts`. Go to definition on `$seeders.blog.tags` opens the seeder file. `$seeders` is available on the server only.

A seeder can use the [factories](./testing.md#factories) of your tests. Import them from `server/factories/`. A seeder can also write with `useDb()`:

```ts
// server/seeders/tags.seeder.ts
import { tagTable } from "#nuxvel/schema";

export const tagsSeeder = defineSeeder(async () => {
  await useDb().insert(tagTable).values([{ name: "nuxt" }, { name: "drizzle" }]);
});
```

### Calling other seeders

```ts
// server/seeders/database.seeder.ts
export const databaseSeeder = defineSeeder(async ({ call }) => {
  await call("tags", "posts");
});
```

`call(...seeders)` runs other seeders in the given order and waits for them. The names are typed. A name that no seeder has fails to compile. In place of a name, `call()` also takes a seeder definition, from `$seeders` or from an import, for example `call($seeders.tags)`.

A seeder runs one time in each run. When a second seeder calls it again, the call does nothing. So two seeders can both call the seeder that they need. Two seeders that call each other stop the run with an error.

### Running seeders

```bash
nuxvel db:seed
nuxvel db:seed posts
nuxvel db:fresh --seed
```

`nuxvel db:seed` runs every seeder. Give names to run only those seeders. `nuxvel db:fresh` drops every table and applies the migrations. With `--seed`, it then runs every seeder. Both commands refuse to run when `NODE_ENV` is `production`. See the [CLI reference](./cli.md#nuxvel-dbseed-name).

After the seeders commit, both commands remove every value in the [cache](./cache.md). A running dev server then shows the new rows.

A seeder inserts new rows each time that it runs. A second run can thus break a unique constraint, for example on an email. To start again from an empty database, run `nuxvel db:fresh --seed`.

### Printing lines

```ts
// server/seeders/database.seeder.ts
import { userFactory } from "#nuxvel/factories";

export const databaseSeeder = defineSeeder(async () => {
  await userFactory.withPassword("demo-password")({ email: "demo@example.com" });

  return ["Sign in as demo@example.com with the password demo-password"];
});
```

A seeder can return lines of text. `nuxvel db:seed` and `nuxvel db:fresh --seed` print them under the name of the seeder:

```
✔ Seeded database
  Sign in as demo@example.com with the password demo-password
```

A seeder that returns nothing prints only its name.

### Volume data

```bash
nuxvel db:fresh --force
nuxvel db:seed --volume
```

`nuxvel db:seed --volume` fills each table of the schema with 1000 generated rows, with [drizzle-seed](https://orm.drizzle.team/docs/seed-overview), to try the app with realistic amounts of data. It does not run the seeders. It skips the tables of nuxvel (such as `audit_log`, `outbox` and `session`), each table with a `tsvector` column, such as one with [`searchable()`](#full-text-search), which drizzle-seed cannot fill, and each table that references a skipped one. It lists every table it skips. Run it on a fresh database: its values can clash with rows already there.

### Transactions and the actor

```ts
export const welcomePostSeeder = defineSeeder(async () => {
  const post = await insertOne(postTable, welcomePost);

  await audit("post.imported", post);
});
```

Each seeder runs in one transaction. `useDb()` and the factories join it. When the seeder throws, nothing that it wrote stays in the database. A seeder that `call()` runs is part of the transaction of the seeder that calls it.

The actor of a seeder is `systemActor("seed")`. So `audit()` works, and the row has the actor type `system` and the actor id `seed`. An action that you call without an `actor` option also runs as this actor.

## Full-text search

```ts
...searchable(["title", "body"]),
```

`searchable()` adds a Postgres full-text search column to a table. `search()` and `searchRank()` find and order the matching rows. See [Full-text search](./search.md).

## Testing

```ts
import { actingAs, describe, expect, expectConstantQueries, expectRow, guest, it } from "@nuxvel/nuxt/testing";
import { postTable } from "#nuxvel/schema";
import { postFactory, userFactory } from "#nuxvel/factories";

describe("posts", () => {
  it("creates a post", async () => {
    const { api } = actingAs(await userFactory());

    const post = await api.post.create({ title: "Hello", body: "" });

    expect(post.title).toBe("Hello");
    await expectRow(postTable, { id: post.id, title: "Hello" });
  });

  it("lists posts in a constant number of queries", async () => {
    await expectConstantQueries(async (size) => {
      await userFactory.has(size, (user) => postFactory.for("authorId", user))();
      await guest().api.post.list();
    });
  });
});
```

Functional tests use a real Postgres database. `expectRow` checks that a matching row exists. `expectConstantQueries` fails when the number of queries grows with the number of rows. See [Testing](./testing.md).

```ts
it("seeds the first posts", async () => {
  await runSeeder("posts");

  await expectRow(postTable, { title: "Hello" });
});
```

`runSeeder(name)` runs a seeder, and the seeders that it calls, in the app. Import it from `@nuxvel/nuxt/testing`.

## See also

- [Full-text search](./search.md)
- [Soft deletes](./soft-deletes.md)
- [Validation](./validation.md)
- [Actions](./actions.md)
- [Backfills](./backfills.md)
- [Queues](./queues.md)
- [Testing](./testing.md)
