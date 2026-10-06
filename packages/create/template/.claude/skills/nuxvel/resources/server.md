# Server

All names below are auto-imported in `server/`.

## Table

```ts
import { index, pgTable, serial, varchar } from "drizzle-orm/pg-core";
import { belongsTo, timestamps } from "@nuxvel/nuxt/database";
import { userTable } from "./auth.schema";

export const postTable = pgTable("post", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  authorId: belongsTo(userTable),
  ...timestamps(),
}, (table) => [index("post_author_id_idx").on(table.authorId)]);
export type PostRow = typeof postTable.$inferSelect;
export type NewPostRow = typeof postTable.$inferInsert;
```

- `timestamps()`: `createdAt`, `updatedAt`. `softDeletes()`: `deletedAt`. User id is `text`.
- `belongsTo(userTable)` (from `@nuxvel/nuxt/database`) = `text("<key in snake_case>").notNull().references(() => userTable.id, { onDelete: "cascade" })`. Options: `column`, `onDelete`, `nullable: true`. No index: keep the `index(...)` line. A self-reference keeps `.references()`.
- `shared/schemas/post.ts`: `createPostInput`, `updatePostInput` (`.partial()` + `id`), `postIdInput`, `postSchema` (row, the output shape). Change `postSchema` when a column changes. Leave out columns a caller must not see.

## Action

```ts
import { postTable } from "#nuxvel/schema";

export const updatePostAction = defineAction({
  input: updatePostInput,
  errors: { "post.locked": "This post is locked" },
  handler: async (input, _ctx, fail) => {
    const post = await findAuthorized(postTable, input.id, "update");
    if (post.locked) return fail("post.locked");
    return updateOne(postTable, input.id, { title: input.title });
  },
});
```

| Option | Meaning |
|---|---|
| `input` | Zod schema. Parsed on each call. Fail → `ValidationFailedError` |
| `handler(input, ctx, fail)` | `ctx.actor`. `ctx.actor.userId` is the user behind a user or an API key, `undefined` for a system actor. `return fail(code, message?)` → `ActionError`, HTTP 422, `error.data.actionCode` |
| `errors` | `{ code: defaultMessage }`, or `{ code: { message, field } }` for a failure on one input field (sent in `error.data.fields`, shown under that field by `useActionForm`). Only these codes compile in `fail` |
| `transaction: false` | no transaction (reads) |
| `rateLimit` | options of `rateLimit()` |
| `audit` | `"post.created"` audits the returned row. `{ name: "post.updated", target: postTable }` audits the row of `input.id` with the changed columns |
| `output` | schema of what the mounted procedure sends. Required with `procedure` (`test:arch`) |
| `procedure` | `"public"`, `"authed"`, `"admin"` or a builder (`roleProcedure(["editor"])`): also a mutation at its path, `$api.posts.updatePost` for `actions/posts/update-post.action.ts`, no router. A router key at that path fails the build |
| `invalidates` | tags to forget after commit, each with every key under it: `["post", ["user", id]]`, or `(output, input) => tags`. Use router names, and cache under them: `remember(["post", "list", input], …)`. The client refetches the queries under each tag, and the router's own. A string with `*` stays a glob |

- Runs in `transaction()`. A nested action joins it (savepoint) and inherits the actor.
- DB errors: unique → `ConflictError` (409). FK → `ValidationFailedError` or `ConflictError`. Deadlock/timeout → `TransientError`.
- Call: `$actions.posts.createPost(input)` runs as the actor in scope (procedure, job, action). No request: `{ actor: systemActor("import-job") }` or `{ actor: userActor(user) }`.
- `isActionError(error, updatePostAction, "post.locked")` narrows.

## Router

```ts
import { desc } from "drizzle-orm";
import { postTable } from "#nuxvel/schema";

export const postRouter = {
  list: publicProcedure
    .input(paginationSchema)
    .output(paginated(postSchema))
    .query(({ input }) => paginate(useDb().select().from(postTable).orderBy(desc(postTable.id)).$dynamic(), input)),
  byId: publicProcedure.input(postIdInput).output(postSchema).query(({ input }) => findOrFail(postTable, input.id)),
  create: authedProcedure.output(postSchema).action($actions.posts.createPost),
};
```

| Builder | Needs | Else |
|---|---|---|
| `publicProcedure` | nothing. `ctx.user`, `ctx.actor` can be `null` | |
| `authedProcedure` | session or API key. `ctx.actor.userId` is a `string` | `UNAUTHORIZED` |
| `roleProcedure(["admin", "agent"], { apiKeys? })` | role in list | `FORBIDDEN` |
| `adminProcedure` | role `admin` + two-factor, no API key | `FORBIDDEN` |
| `freshProcedure` | sign-in < 10 min | `FORBIDDEN` |
| `signedProcedure(options)` | valid signed link. Runs as system actor | `FORBIDDEN` |

Middleware (`.use(...)`): `idempotent`, `rateLimit({ points: 5, window: { minutes: 1 }, by: "user" })`.

- `.action($actions.posts.createPost)` on any builder: a mutation with the action's input, its errors, and the `.output()` before it (required, `test:arch`), run as the caller (a guest is `{ type: "guest" }`). Use `.mutation()` only when it does more than call the action.
- In `.mutation()`, pass `input` to the action unchanged. Put transforms in the action schema, not the procedure schema.
- `useCaller().post.list()`: in-process call as the current request user.
- `.openapi({ path: "/posts", protect: false })` also serves it over REST: `GET` for a query, `POST` for a mutation, tag from the router. Other method: `.meta({ openapi: { method: "PATCH", path } })`.
- A route in `server/api/` only reads. `defineValidatedHandler({ params, query, body }, handler)` validates it.

## Policy

```ts
export const postPolicy = definePolicy(postTable, {
  update: (actor, post) => post.authorId === actor.id || actor.role === "admin",
  delete: () => false,
});
```

- `can($policies.post.update, post)` → boolean. `authorize(...)` → throws `ForbiddenError`. String form: `can("update", postTable, post)`. No actor argument: they read the actor of the running procedure, action, job or seeder (the guest in a signed-out request).
- `findAuthorized(postTable, input.id, "update")` → the row, or `NotFoundError`, or `ForbiddenError`. Use it in place of `findOrFail()` + `authorize()`. Takes `{ trashed: "only" }` for a restore.
- `canMany([$policies.post.update, $policies.post.delete], rows)` → `[{ update, delete }]` per row, one `preload` for the list.
- `.output(withAbilities(postSchema, [$policies.post.update, $policies.post.delete]))`, or `paginated(withAbilities(...))`: each row gets `can: { update, delete }` for the caller, one `canMany` per response. The client reads `post.can.update`. No separate `abilities` procedure.
- `allowSystem(rule)`: system actors reach the rule. Without it, the rule refuses a system actor.
- `allowGuest(rule)`: the guest actor (signed-out caller of a public action) reaches the rule. Without it, the rule refuses the guest.
- One policy per table. No rule → `false`.

## Queries

| Name | Use |
|---|---|
| `useDb()` | Drizzle client, or the active transaction |
| `findOrFail(table, id)`, `firstOrFail(rows)` | row, or `NotFoundError` |
| `insertOne(table, values)`, `updateOne(table, id, values)` | the written row. `updateOne` → `NotFoundError` when no row has `id`. Drizzle chain for anything else |
| `transaction(fn)`, `onCommit(fn)`, `beforeCommit(fn)` | transaction hooks |
| `paginate(query.$dynamic(), { page, perPage })` | `{ rows, page, perPage, total, lastPage }`. `.orderBy()` must end on a unique column |
| `paginateCursor(...)` | keyset page + next cursor |
| `paginationSchema`, `paginated(rowSchema)` | input, output schema |
| `listQuery(columns)`, `listWhere(table, input.filters)`, `listOrderBy(table, input.sort)` | server sort + filter |
| `search(table, q)`, `searchRank`, `highlight` | full-text search. Table needs `...searchable(["title"])` |
| `notTrashed(table)`, `onlyTrashed`, `softDelete(table, id)`, `restore(table, id)`, `forceDelete(table, id)` | soft deletes. With an `id`: the row, or `NotFoundError`. With a `where`: the changed rows |
| `loader(fn)`, `chunkById(...)`, `allowRepeatedQueries(fn)` | N+1 control |
| `now()` | current time, test clock aware |

## Auth and errors

- `useAuth()` → `{ user, actor }` anywhere on the server, each `null` when signed out. `requireAuth()` → session or `UnauthenticatedError`. Actor types are the strings `"user"`, `"system"`, `"api-key"`, `"guest"`.
- Errors: `NotFoundError`, `ConflictError`, `ForbiddenError`, `UnauthenticatedError`, `ValidationFailedError`, `RateLimitedError`, `TransientError`, `UnknownError`. `isTaxonomyError(error, code)`.
- Other: `audit(name, row, { changes })`, `signedUrl(path, { expiresIn })`, `requireSignature(event)`, `sanitizeHtml`, `richText` (Zod), `flash(message)`, `useLogger(tag?)` (tag defaults to the running action or job), `clientIp()`, `csvSafe()`.
