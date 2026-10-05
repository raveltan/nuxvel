# Full-text search

## Introduction

nuxvel searches text with the full-text search of Postgres. You make a table searchable in its schema file. Then you filter and order rows with `search()` and `searchRank()`, and show snippets with `highlight()`. Use it to search posts, products or other rows by the words they contain.

## Making a table searchable

```sh
nuxvel make:schema post --searchable title,body
```

With `--searchable`, `nuxvel make:schema` adds a `text` column for each name, and makes the columns searchable:

```ts
// server/database/schema/post.schema.ts
import { pgTable, serial, text } from "drizzle-orm/pg-core";
import { searchable, searchIndex, timestamps } from "@nuxvel/nuxt/database";

export const postTable = pgTable("post", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  ...searchable(["title", "body"]),
  ...timestamps(),
}, (table) => [searchIndex(table)]);

export type PostRow = typeof postTable.$inferSelect;
export type NewPostRow = typeof postTable.$inferInsert;
```

To make a table that exists searchable, add `searchable()` and `searchIndex()` to it yourself.

`searchable(columns)` adds a `search_vector` column of type `tsvector`. Postgres builds it from the text columns that you name, and updates it on every write. `searchIndex(table)` adds a GIN index on that column. Give the database names of the columns. Run `nuxvel db:generate` and `nuxvel db:migrate` to add the column and the index. On a table that exists, `db:generate` puts the index in a second migration that builds it with `CREATE INDEX CONCURRENTLY`, so the writes to the table go on while the index builds. See [Indexes on existing tables](./database.md#indexes-on-existing-tables).

Each column has a weight from `A` (highest) to `D` (lowest). A match in a column with a higher weight ranks higher. By default, the first column gets `A`, the second `B`, the third `C` and all other columns `D`.

```ts
...searchable(["title", "summary", "body"], {
  language: "simple",
  weights: { summary: "A" },
}),
```

| Option | Default | Description |
|---|---|---|
| `language` | `"english"` | The Postgres text search configuration. It sets the stop words and the stemming. |
| `weights` | `A`, `B`, `C`, then `D` | The weight of each column, by column name. |

`select()` and `.returning()` include the column as `searchVector`. To leave it out of an API response, select the other columns:

```ts
import { getTableColumns } from "drizzle-orm";

const { searchVector: _searchVector, ...postColumns } = getTableColumns(postTable);

const rows = await useDb().select(postColumns).from(postTable);
```

`audited()` does not record changes to `searchVector`.

## Searching rows

```ts
// server/trpc/routers/post.router.ts
import { desc, getTableColumns } from "drizzle-orm";
import { z } from "zod";
import { postTable } from "../../database/schema/post.schema";

const { searchVector: _searchVector, ...postColumns } = getTableColumns(postTable);

export const postRouter = {
  list: publicProcedure
    .input(z.object({ q: z.string().max(200).default("") }))
    .output(z.array(postSchema))
    .query(({ input }) =>
      useDb()
        .select(postColumns)
        .from(postTable)
        .where(search(postTable, input.q))
        .orderBy(desc(searchRank(postTable, input.q)), postTable.id),
    ),
};
```

`search(table, q)` returns a condition for `.where()`. It matches the rows whose `search_vector` matches `q`. `searchRank(table, q)` returns the rank of each row. Order by it descending to show the best match first. Both take only a table with a `searchable()` column. Any other table is a type error.

`q` is user input. It goes to Postgres as a query parameter, so SQL in `q` is only search text. `q` uses web search syntax:

| Input | Matches |
|---|---|
| `running shoes` | Rows with both words. |
| `"running shoes"` | Rows with the phrase. |
| `running or walking` | Rows with one of the words. |
| `running -shoes` | Rows with `running` and without `shoes`. |

The language stems each word, so `running` also finds `run`. Each word also matches as a prefix, so `sho` finds `shoes`. A blank `q` matches every row and ranks every row `0`.

`search()` is a normal Drizzle condition. Combine it with other conditions through `and()`:

```ts
.where(and(eq(postTable.authorId, user.id), search(postTable, input.q)))
```

When the table uses a `language` other than `"english"`, give the same `language` to `search()`, `searchRank()` and `highlight()`:

```ts
search(postTable, input.q, { language: "simple" });
```

### With pagination

```ts
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
  .query(({ input }) => {
    const q = input?.q ?? "";

    return paginate(
      useDb()
        .select(postColumns)
        .from(postTable)
        .where(search(postTable, q))
        .orderBy(desc(searchRank(postTable, q)), desc(postTable.createdAt), desc(postTable.id))
        .$dynamic(),
      input,
    );
  }),
```

`search()` and `searchRank()` go into the query that you give to [`paginate()`](./database.md#pagination). End the `.orderBy()` on a unique column, so that rows with the same rank stay on one page.

On the page, [`<DataTable>`](./frontend.md#data-tables) or [`<SearchInput>`](./frontend.md#search-input) puts the search text in `?q=`. The page passes it to `post.list` as `q`.

## Highlighting matches

```ts
const rows = await useDb()
  .select({ id: postTable.id, title: postTable.title, snippet: highlight(postTable.body, input.q) })
  .from(postTable)
  .where(search(postTable, input.q));
```

`highlight(column, q)` returns a snippet of about 35 words from a text column. The snippet puts each match in a `<mark>` tag:

```
Tips for new <mark>runners</mark>: start slow &amp; rest often
```

The snippet is HTML. `highlight()` escapes the text of the column, so you can show the snippet with `v-html`. A blank `q` returns the whole column, escaped.

## Testing

```ts
import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { postFactory } from "../../server/factories/post.factory";

describe("post search", () => {
  it("finds a post by a stemmed word", async () => {
    const post = await postFactory({ title: "Running shoes", body: "A review" });

    const rows = await guest().trpc.post.list({ q: "run" });

    expect(rows.map((row) => row.id)).toEqual([post.id]);
  });
});
```

The test database runs every migration, so the `search_vector` column and its index exist in tests. See [Testing](./testing.md).

## See also

- [Database](./database.md)
- [API](./api.md)
- [Frontend](./frontend.md)
- [Soft deletes](./soft-deletes.md)
- [CLI: `nuxvel make:resource`](./cli.md#nuxvel-makeresource-name)
