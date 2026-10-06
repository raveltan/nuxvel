# Authorization

## Introduction

Policies decide who may do what to a row. Each policy is one file under `server/policies/` for one table. A policy maps action names, such as `update` or `delete`, to rules. Use `can()` to check a rule and `authorize()` to enforce it.

## Defining a policy

```ts
// server/policies/post.policy.ts
import { postTable } from "#nuxvel/schema";

export const postPolicy = definePolicy(postTable, {
  update: (actor, post) => post.authorId === actor.id,
  delete: () => false,
});
```

`definePolicy` is auto-imported. The first argument is the Drizzle table. The second argument maps action names to rules. A rule receives the actor and the row, and returns a boolean. A rule can be async, for example to check a membership.

The table types the row, so a rule for `postTable` gets a `postTable` row.

To generate a policy file, run `nuxvel make:policy <name>`. See [CLI](./cli.md#nuxvel-makepolicy-name).

## Policy discovery

nuxvel finds every named export whose name ends with `Policy` under `server/policies/**`, for example `export const postPolicy = definePolicy(...)` in `post.policy.ts`. A default export `export default definePolicy(...)` also works. You do not register policies. nuxvel matches each policy to rows by table name.

One table gets one policy. When two files define a policy for the same table, the first call to `can()` throws.

## Checking a rule

```ts
const allowed = await can(ctx.actor, "update", postTable, post);
```

`can()` returns a boolean. It is auto-imported on the server.

The types catch three mistakes at compile time:

- The action must be a rule that the table's policy defines. `can(actor, "updat", postTable, post)` does not compile.
- The table must have a policy. A table that no policy covers does not compile.
- The row must be a row of the table you pass. A comment row for `postTable` does not compile.

`PolicyAction<typeof postTable>` is the set of rule names for a table.

At runtime, `can()` returns `false` when no policy or no matching rule exists. Each decision shows in DevTools.

## Ability refs

```ts
import { postPolicy } from "#server/policies/post.policy";

const allowed = await can(ctx.actor, postPolicy.update, post);
await authorize(ctx.actor, postPolicy.update, post);
```

`definePolicy()` gives the policy one ability ref for each rule, for example `postPolicy.update`. `can()`, `authorize()` and `canMany()` take a ref in place of the rule name and the table. The ref holds the table, so the call has no table argument.

Go-to-definition on `postPolicy.update` opens the `update` rule in the policy file. A misspelled ref such as `postPolicy.updat` does not compile. The row must be a row of the policy's table.

The string form stays valid. A rule named `table`, `tableName`, `rules` or `preload` gets no ref. Use the string form for it.

The auto-imported `$policies` namespace holds each policy under the path of its file, so a ref needs no import:

```ts
const allowed = await can(ctx.actor, $policies.post.update, post);
```

Each path segment is in camelCase and has no kind suffix. `$policies.post` is the policy in `server/policies/post.policy.ts`, and `$policies.healthCheck` is the policy in `health-check.policy.ts`. Go-to-definition on `$policies.post.update` also opens the `update` rule. `$policies` is available on the server only.

## Roles in rules

```ts
export const postPolicy = definePolicy(postTable, {
  update: (actor, post) => post.authorId === actor.id || actor.role === "admin",
  delete: (actor, post) => post.authorId === actor.id || actor.role === "admin",
});
```

In a tRPC procedure, `ctx.actor` from `authedProcedure` is the signed-in user, `role` included. A rule that reads `actor.role` works there. See [User roles](./auth.md#user-roles).

## Enforcing a rule

```ts
await authorize(ctx.actor, "update", postTable, post);
```

`authorize()` throws `ForbiddenError` when `can()` returns `false`. The error answers with HTTP 403 (tRPC `FORBIDDEN`). Call `authorize()` in action handlers after you load the row.

## The `authorize` option

```ts
// server/channels/moderation.channel.ts
import { z } from "zod";
import { userTable } from "#nuxvel/schema";

export const moderationChannel = defineChannel({
  events: { flagged: z.object({ postId: z.number() }) },
  authorize: async ({ user }) => {
    if (user === null) return false;

    const account = await findOrFail(userTable, user.id);

    return can(userActor(user), "moderate", userTable, account);
  },
});
```

`defineUpload()`, `defineChannel()` and the `channel` of `defineJob()` take an `authorize` option. That option is not the `authorize()` function:

| Name | Gets | Returns |
|---|---|---|
| The `authorize` option | `{ user }`: the signed-in user, or `null` for a guest. A channel and the `channel` of a job also get `params`, the params of the room as strings | `true` to allow, `false` to refuse with HTTP 403 |
| The `authorize()` function | an actor, an action, a table and a row | nothing. It throws `ForbiddenError` to deny |

The option is a predicate, so call `can()` in it, not `authorize()`. `can()` needs an actor. Build it from the user with `userActor(user)`, which keeps the user's `role`. In the sample, `moderate` is a rule of the policy for the `user` table.

## Authorizing in actions

```ts
// server/actions/posts/update-post.action.ts
import { eq } from "drizzle-orm";
import { postTable } from "#nuxvel/schema";

export const updatePostAction = defineAction({
  input: updatePostInput,
  handler: async (input, ctx) => {
    const post = await findOrFail(postTable, input.id);
    await authorize(ctx.actor, "update", postTable, post);

    return useDb()
      .update(postTable)
      .set({ title: input.title, body: input.body })
      .where(eq(postTable.id, input.id))
      .returning()
      .then(firstOrFail);
  },
});
```

Load the row, then authorize, then change it.

## System actors

```ts
export const postPolicy = definePolicy(postTable, {
  update: (actor, post) => post.authorId === actor.id,
  reindex: allowSystem(() => true),
});
```

Policies deny a `systemActor(...)` by default. Wrap a rule in `allowSystem()` when system actors, such as a job or a scheduled task, must pass it. The wrapped rule still runs, so it can check the row.

## Preloading data for rules

```ts
// server/policies/post.policy.ts
import { inArray } from "drizzle-orm";
import { postEditorsTable, postTable } from "#nuxvel/schema";

export const postPolicy = definePolicy(postTable, {
  preload: async (actor, rows) => {
    const editors = await useDb()
      .select()
      .from(postEditorsTable)
      .where(inArray(postEditorsTable.postId, rows.map((post) => post.id)));

    return { editorIds: new Set(editors.filter((row) => row.userId === actor.id).map((row) => row.postId)) };
  },
  rules: {
    update: (actor, post, { editorIds }) => post.authorId === actor.id || editorIds.has(post.id),
  },
});
```

A rule that needs more data than the row gets it from `preload`. Pass `{ preload, rules }` as the second argument of `definePolicy()`. `preload` receives the actor and every row being checked. Its result is the third argument of each rule, and the types follow it.

`can()` calls `preload` with the one row. `canMany()` calls it once for the whole list, so load the data for all rows in one query.

## Checking a list

```ts
const rows = await useDb().select().from(postTable).where(inArray(postTable.id, input.ids));
const abilities = await canMany(ctx.actor, [postPolicy.update, postPolicy.delete], rows);

return rows.map((post, index) => ({ id: post.id, can: abilities[index] }));
```

`canMany(actor, refs, rows)` and `canMany(actor, actions, table, rows)` return one object per row, in the order of `rows`. Each object maps an action to a boolean, for example `{ update: true, delete: false }`. It is auto-imported on the server.

Each answer is the answer `can()` gives for that row. `canMany()` runs the policy's `preload` once, so the check runs the same number of queries for 1 row and for 100 rows. Use it when a page shows buttons for each row of a list.

## Scoping reads

A policy checks one row that the code already loaded. It does not hide rows from a list. Put the owner condition in the query. `make:router --crud` and `make:resource` write their reads this way:

```ts
list: authedProcedure
  .input(postListInput)
  .output(paginated(postSchema))
  .query(({ input, ctx }) =>
    paginate(
      useDb()
        .select()
        .from(postTable)
        .where(and(eq(postTable.ownerId, ctx.user.id), listWhere(postTable, input.filters)))
        .$dynamic(),
      input,
    ),
  ),
byId: authedProcedure
  .input(postIdInput)
  .output(postSchema)
  .query(({ input, ctx }) =>
    useDb()
      .select()
      .from(postTable)
      .where(and(eq(postTable.id, input.id), eq(postTable.ownerId, ctx.user.id)))
      .then(firstOrFail),
  ),
```

A row of another user gives `NOT_FOUND`, the same as a row that does not exist. Use `ctx.user.id`. For an API-key call, `ctx.user` is the owner of the key. To share rows, change the condition. Use `publicProcedure` only for data that every visitor may see, and remove each private column from the output schema.

## Checking a parent row

A policy checks the row that the action writes. It does not check a row that a reference field points at. Load the parent row with the owner condition before the write:

```ts
export const createCommentAction = defineAction({
  input: createCommentInput,
  handler: async (input, ctx) => {
    await useDb()
      .select()
      .from(postTable)
      .where(and(eq(postTable.id, input.postId), eq(postTable.ownerId, ctx.actor.userId ?? ctx.actor.id)))
      .then(firstOrFail);

    return useDb()
      .insert(commentTable)
      .values({ ...input, ownerId: ctx.actor.userId ?? ctx.actor.id })
      .returning()
      .then(firstOrFail);
  },
});
```

`make:router --crud` and `make:resource` write this check for each reference to a table with an `ownerId` column. The update action checks only a reference that changes. A parent row of another user gives `NOT_FOUND`, the same as a row that does not exist. A reference to `user`, or to a table without `ownerId`, gets no check. For an API-key actor, `actor.id` is the key, so the check, the create action and the generated policy use `actor.userId ?? actor.id`, the user of the key.

## Showing what a user may do

```ts
// server/trpc/routers/post.router.ts
abilities: authedProcedure
  .input(postIdInput)
  .output(z.object({ update: z.boolean(), delete: z.boolean() }))
  .query(async ({ input, ctx }) => {
    const post = await findOrFail(postTable, input.id);

    return {
      update: await can(ctx.actor, "update", postTable, post),
      delete: await can(ctx.actor, "delete", postTable, post),
    };
  }),
```

Return the result of `can()` from a query when the page must show or hide a button. For a list, return the result of `canMany()`. The action still calls `authorize()`.

## Testing

```ts
import { actingAs, expect, expectConstantQueries, expectPolicyChecked } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { postTable } from "#nuxvel/schema";
import { postFactory, userFactory } from "#nuxvel/factories";

describe("post policy", () => {
  it("refuses to update another user's post", async () => {
    const post = await postFactory();
    const { trpc } = actingAs(await userFactory());

    await expect(trpc.post.update({ id: post.id, title: "Mine now", body: "Edited" }))
      .rejects.toBeTrpcError("FORBIDDEN");
    await expectPolicyChecked("update", postTable, { allowed: false });
  });
});
```

`can(user, action, table, row)` comes from `@nuxvel/nuxt/testing`. It asks the policy of the app, so it tests a rule without a router.

```ts
it("lets only the author update a post", async () => {
  const post = await postFactory({ authorId: author.id });

  expect(await can(author, "update", postTable, post)).toBe(true);
  expect(await can(stranger, "update", postTable, post)).toBe(false);
});
```

`expectPolicyChecked(action, table, { allowed? })` proves that the procedure asked the policy, and what it answered. A procedure that skips the check fails it.

```ts
it("checks a list of posts with constant queries", async () => {
  const { trpc } = actingAs(await userFactory({ role: "admin" }));

  await expectConstantQueries(async (size) => {
    const rows = await Promise.all(Array.from({ length: size }, () => postFactory()));
    await trpc.post.abilitiesMany({ ids: rows.map((post) => post.id) });
  }, [1, 10]);
});
```

`expectConstantQueries()` proves that `canMany()` does not run a query for each row. See [Testing](./testing.md).

## See also

- [Auth](./auth.md)
- [Actions](./actions.md)
- [API (tRPC)](./api.md)
