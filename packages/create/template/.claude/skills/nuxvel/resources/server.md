# Server

All names below are auto-imported in `server/`.

## Table

```ts
import { index, pgTable, serial, text, varchar } from "drizzle-orm/pg-core";
import { timestamps } from "@nuxvel/nuxt/database";
import { userTable } from "./auth.schema";

export const postTable = pgTable("post", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  authorId: text("author_id").notNull().references(() => userTable.id, { onDelete: "cascade" }),
  ...timestamps(),
}, (table) => [index("post_author_id_idx").on(table.authorId)]);
export type PostRow = typeof postTable.$inferSelect;
export type NewPostRow = typeof postTable.$inferInsert;
```

- `timestamps()`: `createdAt`, `updatedAt`. `softDeletes()`: `deletedAt`. User id is `text`.
- `shared/schemas/post.ts`: `createPostInput`, `updatePostInput` (`.partial()` + `id`), `postIdInput`, `postSchema` (row, the output shape). Change `postSchema` when a column changes. Leave out columns a caller must not see.

## Action

```ts
import { eq } from "drizzle-orm";
import { postTable } from "../../database/schema/post.schema";

export const updatePostAction = defineAction({
  input: updatePostInput,
  errors: { "post.locked": "This post is locked" },
  handler: async (input, ctx, fail) => {
    const post = await findOrFail(postTable, input.id);
    await authorize(ctx.actor, $policies.post.update, post);
    if (post.locked) return fail("post.locked");
    return useDb().update(postTable).set({ title: input.title }).where(eq(postTable.id, input.id)).returning().then(firstOrFail);
  },
});
```

| Option | Meaning |
|---|---|
| `input` | Zod schema. Parsed on each call. Fail → `ValidationFailedError` |
| `handler(input, ctx, fail)` | `ctx.actor`. `return fail(code, message?)` → `ActionError`, HTTP 422, `error.data.actionCode` |
| `errors` | `{ code: defaultMessage }`. Only these codes compile in `fail` |
| `transaction: false` | no transaction (reads) |
| `rateLimit` | options of `rateLimit()` |
| `invalidates` | cache key patterns to forget after commit, `["posts:*"]` |

- Runs in `transaction()`. A nested action joins it (savepoint) and inherits the actor.
- DB errors: unique → `ConflictError` (409). FK → `ValidationFailedError` or `ConflictError`. Deadlock/timeout → `TransientError`.
- Call: `createPostAction(input, { actor: ctx.actor })`. No request: `{ actor: systemActor("import-job") }` or `{ actor: userActor(user) }`.
- `isActionError(error, updatePostAction, "post.locked")` narrows.

## Router

```ts
import { desc } from "drizzle-orm";
import { createPostAction } from "../../actions/posts/create-post.action";
import { postTable } from "../../database/schema/post.schema";

export const postRouter = {
  list: publicProcedure
    .input(paginationSchema)
    .output(paginated(postSchema))
    .query(({ input }) => paginate(useDb().select().from(postTable).orderBy(desc(postTable.id)).$dynamic(), input)),
  byId: publicProcedure.input(postIdInput).output(postSchema).query(({ input }) => findOrFail(postTable, input.id)),
  create: authedProcedure
    .input(createPostInput)
    .output(postSchema)
    .mutation(({ input, ctx }) => createPostAction(input, { actor: ctx.actor })),
};
```

| Builder | Needs | Else |
|---|---|---|
| `publicProcedure` | nothing. `ctx.user`, `ctx.actor` can be `null` | |
| `authedProcedure` | session or API key | `UNAUTHORIZED` |
| `roleProcedure(["admin", "agent"], { apiKeys? })` | role in list | `FORBIDDEN` |
| `adminProcedure` | role `admin` + two-factor, no API key | `FORBIDDEN` |
| `freshProcedure` | sign-in < 10 min | `FORBIDDEN` |
| `signedProcedure(options)` | valid signed link. Runs as system actor | `FORBIDDEN` |

Middleware (`.use(...)`): `idempotent`, `audited("post.updated", { target: postTable })`, `rateLimit({ points: 5, window: { minutes: 1 }, by: "user" })`.

- Pass `input` to the action unchanged. Put transforms in the action schema, not the procedure schema.
- `useCaller().post.list()`: in-process call as the current request user.
- `.meta({ openapi: { method: "GET", path: "/posts", protect: false } })` also serves it over REST.
- A route in `server/api/` only reads. `defineValidatedHandler({ params, query, body }, handler)` validates it.

## Policy

```ts
export const postPolicy = definePolicy(postTable, {
  update: (actor, post) => post.authorId === actor.id || actor.role === "admin",
  delete: () => false,
});
```

- `can(actor, $policies.post.update, post)` → boolean. `authorize(...)` → throws `ForbiddenError`. String form: `can(actor, "update", postTable, post)`.
- `canMany(actor, [postPolicy.update, postPolicy.delete], rows)` → `[{ update, delete }]` per row, one `preload` for the list.
- `allowSystem(rule)`: system actors reach the rule. Without it, the rule refuses a system actor.
- One policy per table. No rule → `false`.

## Queries

| Name | Use |
|---|---|
| `useDb()` | Drizzle client, or the active transaction |
| `findOrFail(table, id)`, `firstOrFail(rows)` | row, or `NotFoundError` |
| `transaction(fn)`, `onCommit(fn)`, `beforeCommit(fn)` | transaction hooks |
| `paginate(query.$dynamic(), { page, perPage })` | `{ rows, page, perPage, total, lastPage }`. `.orderBy()` must end on a unique column |
| `paginateCursor(...)` | keyset page + next cursor |
| `paginationSchema`, `paginated(rowSchema)` | input, output schema |
| `listQuery(columns)`, `listWhere(table, input.filters)`, `listOrderBy(table, input.sort)` | server sort + filter |
| `search(table, q)`, `searchRank`, `highlight` | full-text search. Table needs `...searchable(["title"])` |
| `notTrashed(table)`, `onlyTrashed`, `softDelete`, `restore`, `forceDelete` | soft deletes |
| `loader(fn)`, `chunkById(...)`, `allowRepeatedQueries(fn)` | N+1 control |
| `now()` | current time, test clock aware |

## Auth and errors

- `auth()` → session or `null`. `requireAuth()` → session or `UnauthenticatedError`. `useAuth()` → `{ user, actor }` anywhere on the server.
- Errors: `NotFoundError`, `ConflictError`, `ForbiddenError`, `UnauthenticatedError`, `ValidationFailedError`, `RateLimitedError`, `TransientError`, `UnknownError`. `isTaxonomyError(error, code)`.
- Other: `audit(action, { type, id }, { changes })`, `signedUrl(path, { expiresIn })`, `requireSignature(event)`, `sanitizeHtml`, `richText` (Zod), `flash(message)`, `useLogger()`, `clientIp()`, `csvSafe()`.
