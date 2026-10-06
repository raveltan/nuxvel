# Actions

## Introduction

An action is one business operation in one file, for example "create a post" or "update a post". Actions are the write layer of the app. Each call validates its input, runs in a database transaction and writes one trace line with its actor and duration. Routers, jobs and tasks call actions to change data.

## Defining an action

```sh
nuxvel make:action posts/create-post
```

`nuxvel make:action` writes the action and a test next to it:

```ts
// server/actions/posts/create-post.action.ts
export const createPostAction = defineAction({
  handler: async () => {},
});
```

Fill in the input schema and the handler. The input of this action is `createPostInput` from `shared/schemas/post.ts`, which `nuxvel make:schema` wrote. See [Validation](./validation.md#defining-a-schema):

```ts
// server/actions/posts/create-post.action.ts
import { postTable } from "#nuxvel/schema";

export const createPostAction = defineAction({
  input: createPostInput,
  handler: async (input, ctx) => {
    return useDb()
      .insert(postTable)
      .values({ title: input.title, body: input.body, authorId: ctx.actor.id })
      .returning()
      .then(firstOrFail);
  },
});
```

The generated test at `server/actions/posts/create-post.action.test.ts` calls the action with `runAction` and expects `undefined`. Change it to send a valid input and to check the new row. See [Testing](#testing).

Put each action in its own file under `server/actions/<domain>/`. `defineAction` is auto-imported, and so are the schemas in `shared/schemas/`.

| File | Export | Action name |
|---|---|---|
| `server/actions/posts/create-post.action.ts` | `createPostAction` | `posts.create-post` |
| `server/actions/posts/update-post.action.ts` | `updatePostAction` | `posts.update-post` |

Name the export after the file name in camelCase, with `Action` at the end: `create-post.action.ts` exports `createPostAction`. A file without the suffix also works. Then the export has no suffix: `create-post.ts` exports `createPost`. The file path gives the action name. The action's `actionName` property and its trace lines carry this name.

The auto-imported `$actions` namespace holds each action under its path. Each path segment is in camelCase and has no kind suffix. `$actions.posts.createPost` is the action in `server/actions/posts/create-post.action.ts`. Go to definition on `$actions.posts.createPost` opens the action file. `$actions` is available on the server only.

When no shared schema has the input of the action, give fields after the name. The command writes them into the `input` schema:

```sh
nuxvel make:action posts/archive-post post_id:integer reason:text
```

```ts
// server/actions/posts/archive-post.action.ts
import { z } from "zod";

export const archivePostAction = defineAction({
  input: z.object({
    postId: z.number().int(),
    reason: z.string().trim().min(1),
  }),
  handler: async () => {},
});
```

The test then calls the action with a sample value for each field, here `{ postId: 1, reason: "Sample text" }`. See [CLI: fields](./cli.md#fields).

An action that takes no input leaves `input` out. It then takes `{}` or `undefined`:

```ts
// server/actions/posts/publish-all.action.ts
import { postTable } from "#nuxvel/schema";

export const publishAllAction = defineAction({
  handler: async () => useDb().update(postTable).set({ publishedAt: new Date() }),
});
```

A file that exports more than one action fails at boot. An action defined outside `server/actions/` throws when you call it. `nuxvel test:arch` reports a file whose export name does not match its file name.

## Serving an action as a procedure

```ts
// server/actions/posts/update-post.action.ts
export const updatePostAction = defineAction({
  input: updatePostInput,
  procedure: "authed",
  output: postSchema,
  handler: async (input) => { /* ... */ },
});
```

With `procedure`, the action is also a tRPC mutation at its path, with no router: `server/actions/posts/update-post.action.ts` is `posts.updatePost`. The client calls it as `$api.posts.updatePost`, with the types of the action, and `nuxvel routes` lists it with the action file.

| `procedure` | The mutation is |
|---|---|
| `"public"` | `publicProcedure.output(output).action(action)` |
| `"authed"` | `authedProcedure.output(output).action(action)` |
| `"admin"` | `adminProcedure.output(output).action(action)` |
| a builder, such as `roleProcedure(["editor"])` | `builder.output(output).action(action)` |

`output` is the schema of what the mutation sends, as `.output()` of a router procedure. A field that it does not list, such as a password hash, never reaches the client, and the `$api` type has only its fields. A call from server code still gets the whole result of the handler. `nuxvel test:arch` reports an action with `procedure` and no `output`.

The input is the input schema of the action, and a [typed failure](#typed-failures) reaches the client as it is. See [API: running an action](./api.md#running-an-action). The action runs as the caller. A signed-out caller of a `"public"` action is the actor `{ type: "guest", id: "guest" }`. Policies deny it unless the rule is wrapped in [`allowGuest()`](./authorization.md#guests), and `rateLimit` with `by: "user"` counts it by its IP.

When a router has the namespace of the action, the action is added to that router: the `posts` router keeps its own procedures beside `posts.updatePost`. A router key or a router file at the path of the action fails the build, and the error names both files.

The build reads `procedure` from the object literal of `defineAction({ ... })`. An action defined with a variable, `defineAction(config)`, is not mounted. An action without `procedure` is not served. Call it from a router when the procedure needs its own middleware, its own OpenAPI path or more work around the action. See [API: running an action](./api.md#running-an-action).

## Calling an action

```ts
// server/trpc/routers/post.router.ts
export const postRouter = {
  create: authedProcedure
    .input(createPostInput)
    .output(postSchema)
    .mutation(async ({ input }) => {
      const post = await $actions.posts.createPost(input);
      flash("Post created");
      return post;
    }),
};
```

Call the action from `$actions`, or import it, with its input. The call returns a promise of what the handler returns. In a procedure, the action runs as the caller. See [The actor](#the-actor).

The caller passes the input type of the schema. The handler gets the parsed output. The action parses the input once, so pass the raw value, not a value that you parsed already. Async refinements and transforms also work:

```ts
z.string().refine(async (handle) => !(await isTaken(handle)))
```

## The call lifecycle

1. **Validation.** The action parses `input` with the schema. Invalid input throws a `ValidationFailedError`. See [Validation](./validation.md#error-shape).
2. **Rate limit**, if you set `rateLimit`. See [Rate limiting an action](#rate-limiting-an-action).
3. **Transaction.** The handler runs inside `transaction()`. An action that another action calls joins the outer transaction as a savepoint.
4. **Database errors.** The action classifies a database error that the handler does not catch:
   - A unique-constraint violation becomes a `ConflictError` (HTTP 409).
   - A foreign-key violation becomes a `ValidationFailedError` on the column. When the row is still referenced, it becomes a `ConflictError`.
   - A deadlock, a serialization failure, a lock timeout, a cancelled statement or a lost connection becomes a `TransientError`.
5. **Trace.** Each call writes one `action` log line, also when it fails. The line holds the action name, the outcome, the duration, the actor and the request ID. See [Observability](./observability.md#request-logging).

```ts
export const showPostAction = defineAction({
  input: postIdInput,
  transaction: false,
  handler: async (input) => findOrFail(postTable, input.id),
});
```

Set `transaction: false` to run the handler without a transaction, for example for a read.

## The actor

```ts
await createPostAction(input, { actor: userActor(user) });
await createPostAction(input, { actor: systemActor("backfill-job") });
```

Name the actor that does the work in every top-level call outside a procedure: a call from a route, a task or a seed script.

```ts
export const publishPostAction = defineAction({
  input: z.object({ title: z.string(), body: z.string() }),
  handler: async (input) => createPostAction(input),
});
```

Inside an action, a procedure or a job, omit the second argument. The called action then runs as the actor of the running action, procedure or job. If no actor is in scope, the call throws `defineAction: actor is required`.

The second argument of the handler also has `locale`, the locale of the request. A caller can give another locale: `createPostAction(input, { actor, locale: "zh" })`. See [Internationalization: the locale on the server](./i18n.md#the-locale-on-the-server).

An actor is `{ type, id, role?, userId? }`. An API-key actor has the type `"api-key"`, and `userId` is the owner of the key. In a procedure, the actor is the caller, and `ctx.actor` holds it for a policy check. Outside a procedure, use `userActor(user)`. It keeps the user's `role`, so policy rules that check `actor.role` see it. For work with no user, such as a job, a task or a seed script, use `systemActor(name)`. The name identifies the process in traces and audit rows.

```ts
const { actor } = await useAuth();

if (actor?.type === SYSTEM_ACTOR_TYPE) {
  // the action runs from a job, a task, ...
}
```

`useAuth()` returns the actor of the running action and the user behind it. It works in the handler and in all code that the handler calls, at any depth. See [Auth](./auth.md#the-caller-anywhere-on-the-server). `useAuth` and `SYSTEM_ACTOR_TYPE` are auto-imported.

## Typed failures

```ts
// server/actions/posts/update-post.action.ts
import { eq } from "drizzle-orm";
import { postTable } from "#nuxvel/schema";

export const updatePostAction = defineAction({
  input: updatePostInput,
  errors: {
    "post.body-empty": "Body cannot be empty after trimming",
  },
  handler: async (input, ctx, fail) => {
    const post = await findOrFail(postTable, input.id);
    await authorize(ctx.actor, "update", postTable, post);

    if (input.body !== undefined && !input.body.trim()) return fail("post.body-empty");

    return useDb()
      .update(postTable)
      .set({ title: input.title, body: input.body })
      .where(eq(postTable.id, input.id))
      .returning()
      .then(firstOrFail);
  },
});
```

Declare the failures of an action in `errors`, with a default message for each code. Then call `fail(code)` in the handler. A code that is not in the `errors` map does not compile. An action with no `errors` map cannot call `fail()`. To replace the default message, pass a second argument: `fail("post.body-empty", "Write something first")`.

Write `return fail(...)`, not `fail(...)` alone. The return type of `fail()` is `never`, but TypeScript narrows a type after a `never` call only when the function has an explicit type annotation, and the `fail` parameter of a handler does not have one. With `return`, the code after the check sees the narrowed type.

`fail()` throws an `ActionError`. This is an expected failure:

- It answers with HTTP 422, tRPC code `UNPROCESSABLE_CONTENT`.
- Its message stays in production.
- It is not reported to error tracking.
- Its `actionCode` is the declared code. Through tRPC, the client gets it as `error.data.actionCode`, next to the message.

### A failure on a field

```ts
errors: {
  "post.body-empty": { message: "Body cannot be empty after trimming", field: "body" },
},
```

A failure that belongs to one input field declares `{ message, field }` in place of the message. The field must be a key of the input schema. Through tRPC, the client also gets the message as the error of that field, in `error.data.fields`, as for a validation error. The string form and the object form can be mixed in one `errors` map.

[`useActionForm()`](./frontend.md#forms) shows the message under that field. A failure without a field goes to `formError`, unless the form [maps the code to a field](./frontend.md#typed-failures-on-a-field).

A field message from the server whose field is not a key of the form state, for example the `key` field of `promoteUpload()` in a form with `imageKey`, goes to `formError`. It is never shown in both places.

```ts
try {
  await updatePostAction(input, { actor });
} catch (error) {
  if (isActionError(error, updatePostAction, "post.body-empty")) {
    // error.actionCode is typed as "post.body-empty"
  }
}
```

Use `isActionError()` to catch a failure on the server:

- `isActionError(error, updatePostAction, "post.body-empty")` matches only the failures of `updatePostAction`. The code must be one that `updatePostAction` declares.
- `isActionError(error, "post.body-empty")` matches that code from any action.

`ActionErrorCode<typeof updatePostAction>` is the union of the codes that an action declares.

## Rate limiting an action

```ts
export const createCommentAction = defineAction({
  input: createCommentInput,
  rateLimit: { points: 10, window: { minutes: 1 }, by: "user" },
  handler: async (input, ctx) => {
    // ...
  },
});
```

`rateLimit: { points, window, by }` allows `points` calls per `window` for each key. The counter uses the action's name. The action counts a call only when the input is valid. Past the limit, the call throws `RateLimitedError` (HTTP 429) and the handler does not run.

`by` sets who shares one budget:

| `by` | Key |
|---|---|
| `"ip"` | the client IP. Throws when there is no request. |
| `"user"` | the actor's ID. Throws for an actor that is not a user. |
| a function | `({ input, actor }) => string`, with the parsed input |

To count against a [shared limit](./security.md#shared-limits), use `rateLimit: { limit, by }`. See also [Security](./security.md#where-its-used).

## After-commit work

```ts
handler: async (input, ctx) => {
  const post = await useDb()
    .insert(postTable)
    .values({ title: input.title, body: input.body, authorId: ctx.actor.id })
    .returning()
    .then(firstOrFail);

  await dispatchAfterCommit("post.notify-followers", { postId: post.id });

  return post;
},
```

`dispatchAfterCommit(name, payload)` queues a job after the enclosing transaction commits. If the transaction rolls back, no job is queued.

The dispatch writes a row to the `outbox` table in the same transaction. `nuxvel queue:work` then moves the row to the queue. A crash between the commit and the enqueue loses nothing. A job can still run more than once, so make its handler safe to run twice. See [Queues](./queues.md#the-outbox).

- Outside a transaction, it writes the outbox row at once. `await` returns when the row is written.
- In a nested action, the job waits for the outermost transaction. If the savepoint of the nested action rolls back, the job is dropped.
- `name` must be a job under `server/jobs/`. A wrong name or payload fails to compile. An unknown name also throws at runtime. In place of the name, you can give the job definition, for example `$jobs.post.notifyFollowers`.
- A third argument sets `delay`, `priority` and `dispatcher`. See [Queues: delay and priority](./queues.md#delay-and-priority).

For a channel event, use [`broadcastAfterCommit()`](./realtime.md#broadcasting-after-the-commit). For another side effect, use [`onCommit`](./database.md#after-the-commit).

### Invalidating cached values

```ts
export const createPostAction = defineAction({
  input: createPostInput,
  invalidates: ["posts"],
  handler: async (input, ctx) => {
    // ...
  },
});
```

`invalidates` lists tags. A tag is a string or a [key array](./cache.md#keys). After the transaction commits, the action removes the value of each tag and every value under it: `"posts"` removes `posts`, `posts:list` and `posts:list:{"page":2}`. A string with `*`, `?` or `[` is a glob, such as `"posts:*"`. When the handler throws, the action removes nothing. See [Cache](./cache.md#invalidation).

```ts
export const updatePostAction = defineAction({
  input: updatePostInput,
  handler: async (input, ctx) => {
    // ...
  },
  invalidates: (post) => [["posts", "list"], ["posts", post.id]],
});
```

A function gets the result of the handler and the parsed input, and returns the tags. Write it after `handler`: TypeScript reads the result type of the handler first. A mutation that runs the action names its tags in its response, see [API](./api.md#what-a-mutation-invalidates).

### Auditing the change

```ts
export const publishPostAction = defineAction({
  input: postIdInput,
  audit: "post.published",
  handler: async ({ id }) =>
    useDb().update(postTable).set({ publishedAt: new Date() }).where(eq(postTable.id, id)).returning().then(firstOrFail),
});
```

`audit` writes an [audit-log](./audit.md) row in the transaction of the action, after the handler returns. A name audits the row that the handler returns. `{ name, target: postTable }` audits the row with the ID `input.id`, with the columns that changed. See [Audit log: auditing an action](./audit.md#auditing-an-action).

## Action rules

- Actions do not import `h3` and do not call `auth()`. They do not depend on HTTP. The router, or another caller, passes the actor in.
- Policies hold authorization. Load the row, then call `authorize()` in the handler. See [Authorization](./authorization.md).
- Put one action in each file. Three small actions are better than one shared abstraction.
- Do not write business logic in routers. Call an action.

`nuxvel test:arch` reports a break of the first rule, and a wrong file name.

## Testing

```ts
import { expect, runAction } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { userFactory } from "#nuxvel/factories";

describe("update post", () => {
  it("rejects an empty body", async () => {
    const author = await userFactory();
    const post = await runAction("posts.create-post", { title: "Hi", body: "" }, { actingAs: author });

    await expect(
      runAction("posts.update-post", { id: post.id, title: "Hi", body: " " }, { actingAs: author }),
    ).rejects.toBeActionError("post.body-empty");
  });
});
```

`runAction(name, input, { actingAs })` runs an action in the app as that user. It uses the same validation, transaction and trace as a real call. The action name is typed from the files under `server/actions/`, so a wrong name fails to compile. For an action that the app calls as `systemActor(name)`, pass `{ asSystem: name }` in place of `actingAs`.

`runAction` also takes the action definition, or its name stub from `#nuxvel/test-namespaces`, in place of the name. Then `input` and the result have the types of that action.

```ts
import { $actions } from "#nuxvel/test-namespaces";

const post = await runAction($actions.posts.createPost, { title: "Hi", body: "" }, { actingAs: author });
```

To test an action through the procedure that calls it, use `actingAs(user).trpc`. `expectActionCalled(name, { actingAs?, asSystem? })` then proves that the procedure called the action as that actor:

```ts
await actingAs(author).trpc.post.update({ id: post.id, title: "New", body: "Text" });
await expectActionCalled("posts.update-post", { actingAs: author });
```

To assert on a dispatched job, use `expectQueued` or `expectNotQueued`. See [Testing](./testing.md).

## See also

- [API (tRPC)](./api.md)
- [Validation](./validation.md)
- [Authorization](./authorization.md)
- [Database: transactions](./database.md#transactions)
- [Queues](./queues.md)
- [Cache](./cache.md)
- [Testing](./testing.md)
