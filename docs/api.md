# API (tRPC)

## Introduction

nuxvel serves a typed [tRPC](https://trpc.io) API at `/api/trpc/**` (under `app.baseURL` when you set one, for example `/app/api/trpc/**`). You write one small router file per domain, and nuxvel merges them into one app router. The browser and the server call the same procedures with full types. Superjson encodes data on both ends, so a `Date` or a `Map` arrives as a `Date` or a `Map`.

## Writing a router

```sh
nuxvel make:router post
```

`nuxvel make:router post` writes `server/trpc/routers/post.router.ts` with an empty router, `export const postRouter = {};`. Add the procedures to it:

```ts
// server/trpc/routers/post.router.ts
import { z } from "zod";
import { postTable } from "#nuxvel/schema";

export const postRouter = {
  list: publicProcedure
    .output(z.array(postSchema))
    .query(() => useDb().select().from(postTable)),

  byId: publicProcedure
    .input(postIdInput)
    .output(postSchema)
    .query(({ input }) => findOrFail(postTable, input.id)),

  create: authedProcedure.output(postSchema).action($actions.posts.createPost),
};
```

Put router files under `server/trpc/routers/`. Export a plain object as a named export whose name ends with `Router`, for example `export const postRouter = { ... }` in `post.router.ts`. A default export also works. nuxvel builds the root router and generates the `AppRouter` type at build time. `publicProcedure`, `authedProcedure`, `useDb` and `findOrFail` are auto-imported, and so are the schemas in `shared/schemas/`. `.action()` runs an action from `$actions`, see [Running an action](#running-an-action). Import tables yourself.

In a `publicProcedure`, `ctx.user` is the signed-in user, or `null` for a signed-out visitor. `ctx.actor` is that user as an actor, or `null`. In each procedure, `ctx.locale` is the locale of the request, see [Internationalization](./i18n.md#the-locale-on-the-server).

Code that a procedure calls reads the same caller with [`useAuth()`](./auth.md#the-caller-anywhere-on-the-server), without `ctx`.

A router reads with `useDb()` queries and writes through [actions](./actions.md). It does not call `useDb().insert()`, `.update()` or `.delete()`. Thus every write gets a transaction, an actor and a trace. `nuxvel test:arch` reports a router that writes directly.

Every query and mutation has an `.output()` schema. tRPC sends what the procedure returns, so a raw row sends every column, also a column that you add to the table later. The output schema removes each field that it does not list. Use the row schema, such as `postSchema` from `shared/schemas/post.ts`, and remove from it each column that a caller must not see. `nuxvel test:arch` reports a query, a mutation or an `.action()` without `.output()`. A procedure that returns nothing uses `.output(z.void())`. The check sees only a chain that starts from a `*Procedure` name, not one that starts from a local variable. A loose schema such as `z.any()` passes the check but removes no field.

A Nitro route under `server/api/` or `server/routes/` only reads. It does not write with `useDb()` and does not call an action. Put the write in a tRPC mutation. `nuxvel test:arch` reports a route that writes, except in a `webhooks`, `uploads` or `auth` folder.

To write a full CRUD slice in one step, run `nuxvel make:resource post title body:text`. It writes the table, the Zod inputs and the row schema, the [user data declaration](./privacy.md#declaring-user-data), the policy, the `create`, `update` and `delete` actions, a router with `list`, `byId`, `create`, `update` and `delete`, and a test for the router. Each procedure of the router has `openapi` meta, so it also answers over REST. See [CLI: make:resource](./cli.md#nuxvel-makeresource-name).

To return a list one page at a time, use `paginate()` and `paginationSchema`. See [Database: pagination](./database.md#pagination).

## Router namespaces

The file path gives the namespace of its procedures:

| File | Namespace |
|---|---|
| `health.ts` | `router.health.*` |
| `posts/comments.ts` | `router.posts.comments.*` |
| `audit-log.ts` | `router.auditLog.*` |
| `admin/index.ts` | `router.admin.index.*` |
| `task.router.ts` | `router.task.*` |

Each folder and file name is one segment. A kebab-case name becomes camelCase. `index` stays a segment. The `.router.ts` suffix is not part of the namespace.

The build fails, and names both files, in these cases:

- A file and a folder have the same namespace, for example `posts.ts` next to `posts/`.
- Two files become the same name in camelCase.
- A file with the `.router.ts` suffix and a file without it have the same namespace, for example `task.ts` next to `task.router.ts`.

In a Nuxt layer app, a namespace in a higher layer hides the routers of lower layers on that namespace.

An action with `procedure` is a mutation at its own path, such as `posts.updatePost` for `server/actions/posts/update-post.action.ts`, in the router of that namespace when there is one. A router key or a router file at that path fails the build, and the error names both files. See [Actions: serving an action as a procedure](./actions.md#serving-an-action-as-a-procedure).

## Procedure builders

| Builder | What it does |
|---|---|
| `publicProcedure` | Needs no session. Adds `ctx.user` and `ctx.actor` like `authedProcedure`, but each is `null` when the call is signed out. |
| `authedProcedure` | Needs a session or an [API key](./openapi.md#api-keys), else throws tRPC `UNAUTHORIZED`. Adds `ctx.user`, the session user with its `role`, and `ctx.actor`, that user as an actor. |
| `roleProcedure(roles, { apiKeys })` | Does what `authedProcedure` does. Then it throws `FORBIDDEN` when the user's `role` is not in `roles`, or when the call uses an API key and `apiKeys` is not `true`. See [Auth: role procedures](./auth.md#role-procedures). |
| `adminProcedure` | Does what `authedProcedure` does. Then it throws `FORBIDDEN` when the user's `role` is not `admin`, when the call uses an API key, or when the session did not pass two-factor sign-in. See [Auth: admin procedures](./auth.md#admin-procedures). |
| `freshProcedure` | Does what `authedProcedure` does. Then it throws `FORBIDDEN` when the sign-in is older than 10 minutes, or when the call uses an API key. See [Auth: recent sign-in procedures](./auth.md#recent-sign-in-procedures). |
| `signedProcedure(options)` | Does what `publicProcedure` does. Then it throws `FORBIDDEN` when the input is not a valid, unexpired [signed link](./security.md#signed-urls). The body runs as a system actor, with `ctx.user` set to `null`. |

All builders do these things:

- They reject a mutation with `FORBIDDEN` when its `Origin` header does not match the request host, or when its `Sec-Fetch-Site` header is `cross-site` or `same-site`. A request with an API key skips this check.
- They turn a database error or an upstream error into a taxonomy error, for example a unique-constraint violation into a `ConflictError`. See [Database errors](#database-errors).

An action called in a procedure runs as the caller: the builder sets the actor, so the call needs no `{ actor: ctx.actor }`. Give `ctx.actor` to policies. Do not build an actor yourself.

### Running an action

```ts
update: authedProcedure.output(postSchema).action($actions.posts.updatePost),
```

`.action(action)` ends a procedure with a mutation that runs the action. It works on every builder, after any `.use()`, `.meta()` or `.openapi()`:

- The input is the input schema of the action. tRPC parses it first, then the action parses the raw input again, so an async refinement runs twice. A schema with a transform works, because the action gets the raw input, not the output of the first parse.
- The output is the `.output()` before `.action()`, else the [`output`](./actions.md#serving-an-action-as-a-procedure) schema of the action, else what the action returns. Set one of them: it lists the fields the browser gets. `nuxvel test:arch` reports an `.action()` without `.output()`, as it does a query or a mutation.
- An error of the action, such as its [typed failure](./actions.md#typed-failures), reaches the caller as it is.
- The action runs as the caller. When nobody is signed in, as in a `publicProcedure`, it runs as the actor `{ type: "guest", id: "guest" }`.

A procedure that does more than forward to the action, for example `flash()` after it, calls the action in `.mutation()`:

```ts
create: authedProcedure
  .input(createPostInput)
  .output(postSchema)
  .mutation(async ({ input }) => {
    const post = await $actions.posts.createPost(input);
    flash("Post created");
    return post;
  }),
```

The action parses `input` again with the same schema. This is safe when the parsed output of the schema is also a valid input. A schema that changes the type does not compile there, for example `z.string().transform(...)` into a `Date`. Give the procedure a plain schema, and do the transform in the action's own schema.

## Rate limiting a procedure

```ts
create: authedProcedure
  .use(rateLimit({ points: 5, window: { minutes: 1 }, by: "user" }))
  .output(postSchema)
  .action($actions.posts.createPost),
```

`rateLimit({ points, window, by })` counts calls for each procedure path. `by` is `"ip"`, `"user"` or a key function. See [Security](./security.md#where-its-used). To spend a [shared limit](./security.md#shared-limits), use `rateLimit({ limit, by })`.

## Idempotent mutations

```ts
create: authedProcedure
  .use(idempotent())
  .output(postSchema)
  .action($actions.posts.createPost),
```

`idempotent()` is auto-imported on the server. It runs a mutation once for each idempotency key, and answers each repeat with the first result. Use it on a mutation that must not run twice when the browser sends it twice, for example a create.

The client sends the key in the `Idempotency-Key` header. `.useMutation()` and `mutationOptions()` of `$api` pick one key and send it with each call. Thus `useActionForm($api.x)` sends it too. Each mutation goes in its own request, not in a batch.

- The first result stays in Redis for 24 hours. The key includes the user, the procedure path, the client's key and the input. A repeat with other input runs again.
- A repeat while the first call still runs gets a `ConflictError`.
- A call that fails stores nothing, so a retry runs again.
- A call without the header runs as usual. A procedure without `idempotent()` ignores the header.

In a test, `actingAs` sends the header with each call:

```ts
import { expect } from "@nuxvel/nuxt/testing";

const ada = actingAs(await userFactory(), { headers: { "Idempotency-Key": "k1" } });
const input = { title: "Hello", body: "First post" };

const first = await ada.api.post.create(input);
const repeat = await ada.api.post.create(input);

expect(repeat.id).toBe(first.id);
```

To test a repeat while the first call still runs, see [Testing: idempotency](./testing.md#idempotency).

## Errors

```ts
const post = await findOrFail(postTable, input.id);
```

Throw a taxonomy error for a failure that you expect. The error classes are auto-imported. A taxonomy error:

- keeps its message in production. `UnknownError` is the exception, see [What the client sees](#what-the-client-sees).
- is not reported to error tracking, and is not logged at `error`. `UnknownError` is the exception.
- answers with its own status, from a procedure and from a plain Nitro handler.

| Error | tRPC code | HTTP |
|---|---|---|
| `ValidationFailedError` | `BAD_REQUEST` (+ `data.fields`) | 400 |
| `UnauthenticatedError` (from `requireAuth()`) | `UNAUTHORIZED` | 401 |
| `ForbiddenError` (from `authorize()`) | `FORBIDDEN` | 403 |
| `NotFoundError` (from `findOrFail()`) | `NOT_FOUND` | 404 |
| `ConflictError` | `CONFLICT` | 409 |
| `ActionError` (from an action's `fail()`) | `UNPROCESSABLE_CONTENT` (+ `data.actionCode`) | 422 |
| `RateLimitedError` | `TOO_MANY_REQUESTS` (+ `data.retryAfter`, `Retry-After`) | 429 |
| `TransientError` | `SERVICE_UNAVAILABLE` | 503 |
| `UnknownError` | `INTERNAL_SERVER_ERROR` | 500 |

`ConflictError` takes a second argument, `{ field }`. The client then gets the message in `data.fields` under that field. A unique violation on a single column sets `field` for you, see [Database errors](#database-errors).

From a plain Nitro handler, the response's `data` holds `code` and `message`. It also holds `fields` for a validation failure or a single-column conflict, and `retryAfter` for a rate limit. For a validation failure, `code` is `VALIDATION_ERROR`. See [Validation](./validation.md#error-shape).

One validation failure has five names:

| Name | What it is |
|---|---|
| `ValidationFailedError` | The error class. Throw it on the server with a `ZodError`. |
| `ValidationError` | The type of the wire shape `{ code, message, fields }`. |
| `toValidationError()` | Builds a `ValidationError` from a `ZodError` and does not throw. |
| `BAD_REQUEST` | The tRPC code of the error, and the code that `isTaxonomyError(error, "BAD_REQUEST")` narrows on. |
| `VALIDATION_ERROR` | The `code` in the body that a plain Nitro handler sends. |

In a plain handler, `readValidatedBody(event, schema.parse)` answers a body that fails the schema as a `ValidationFailedError`. h3's `getValidatedQuery` and `getValidatedRouterParams` do the same. `defineValidatedHandler()` checks all three and types `$fetch` to the route, see [Validation](./validation.md#validating-a-plain-route).

```ts
try {
  return await useCaller().post.byId({ id });
} catch (error) {
  if (isTaxonomyError(error, "NOT_FOUND")) return null;
  throw error;
}
```

Use `isTaxonomyError(error, code)` to branch on a taxonomy error. It also narrows the error to its class: `"CONFLICT"` gives a `ConflictError` with its `field`. Use it, not `instanceof`.

### Database errors

nuxvel turns some Postgres errors into taxonomy errors. It does this for an error that escapes an action, a procedure, a Nitro handler or a job.

| Postgres error | Becomes |
|---|---|
| Unique violation (`23505`) | `ConflictError` |
| Foreign key violation (`23503`) on the row that holds the reference | `ValidationFailedError` |
| Foreign key violation (`23503`) on a row that other rows reference | `ConflictError` |
| Serialization failure (`40001`) | `TransientError` |
| Deadlock (`40P01`) | `TransientError` |
| Lock timeout (`55P03`) | `TransientError` |
| Cancelled statement (`57014`) | `TransientError` |
| Lost connection | `TransientError` |

An insert or update that points a foreign key at a missing row fails with a validation error on that column. For `postTable.authorId`, the client gets `data.fields` of `{ authorId: ["does not exist"] }`. A delete or key change of a row that other rows still reference fails with a `ConflictError`.

Postgres constraints such as `NOT NULL` (`23502`) and `CHECK` (`23514`) stay unexpected errors. Validate the input so that they cannot occur.

A `TransientError` answers with `503`. The client can send the request again. A job that throws it retries with its backoff, see [Queues](./queues.md#failures-and-retries).

### Upstream errors

```ts
export const syncFeedAction = defineAction({
  input: z.object({ url: z.string().url() }),
  handler: ({ url }) => $fetch(url),
});
```

nuxvel also classifies a `$fetch` or `ofetch` error that escapes an action, a procedure, a Nitro handler or a job:

| Upstream failure | Becomes |
|---|---|
| No answer: refused connection, DNS failure, timeout | `TransientError` |
| `408` or any `5xx` | `TransientError` |
| `429` | `RateLimitedError`, with `retryAfter` from the upstream's `Retry-After` in seconds |

Any other `4xx` from an upstream stays an unexpected error.

### Error classifiers

```ts
// server/errors/stripe.classifier.ts
import Stripe from "stripe";

export const stripeClassifier = defineErrorClassifier((error) => {
  if (!(error instanceof Stripe.errors.StripeError)) return undefined;
  if (error.type === "StripeRateLimitError") return new RateLimitedError(error.message);
  if (error.type === "StripeCardError") return new ConflictError(error.message);
  return undefined;
});
```

Add a classifier to map the errors of a library into the taxonomy. Put one classifier in each file under `server/errors/`. nuxvel finds the files. You do not register them.

nuxvel calls the classifiers for an error that escapes an action, a procedure, a Nitro handler or a job. The first taxonomy error that a classifier returns replaces the error. Return `undefined` to leave the error alone. The classifiers run before the database and upstream rules. A taxonomy error that you throw yourself does not go through the classifiers.

Any other error is unexpected. nuxvel logs it and reports it to error tracking. The client does not get its message.

### What the client sees

```json
{ "message": "Something went wrong (ref: 3f1c9a2e-…)", "data": { "code": "INTERNAL_SERVER_ERROR", "requestId": "3f1c9a2e-…" } }
```

A client gets only a message that the app or nuxvel chose. This is the same in development and in production. An unexpected error answers with a generic message and the request id. The real error goes to the log with the same request id. This applies to a procedure, a REST call, a plain Nitro handler, a webhook and a server-rendered page.

| Error | Message the client gets | Logged |
|---|---|---|
| `ValidationFailedError`, `UnauthenticatedError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, `ActionError`, `RateLimitedError` | Its own message | No. In development, a procedure logs it at `warn`, see [Logs](./observability.md#error-lines) |
| Maintenance mode (`nuxvel down`) | The maintenance message | No |
| `TransientError` | Its own message, and `data.requestId` | At `warn`, with its `cause` |
| `UnknownError`, and any other error: a thrown `Error`, a Postgres error, a Zod parse in a handler, a `$fetch` error that is not classified | "Something went wrong (ref: <request id>)", and `data.requestId` | At `error`, and reported to error tracking |

An unexpected error from a plain Nitro handler or a page always answers with `500`. An error that you build with `createError()` keeps its message when its status is below `500` and it has no `Error` as its `cause`.

To show a message for a failure, choose it. Call `fail(code, message)` in an action, see [Typed failures](./actions.md#typed-failures). Throw a taxonomy error in a procedure or a handler. Map the errors of a library with `defineErrorClassifier()`, see [Error classifiers](#error-classifiers).

No error response has a stack, also in development. To find the real error in development, copy the request id from the message. Then use one of these:

- The terminal of the dev server. The log line of the error shows the first 8 characters of the request id, then the stack.
- The **Requests** section of [DevTools](./devtools.md#find-an-error-by-its-request-id). Paste the request id in the filter, or open `/_nuxvel/devtools/?entry=<request id>`. The timeline of the request shows the error with its message and its stack.

### When the server cannot be reached

Sometimes a call gets no tRPC answer. For example, the network is down, or a proxy in front of the app answers with an HTML error page during a deploy. `$api` then gives a `TRPCClientError` with this message and code:

```json
{ "message": "Can't reach the server. Check your connection and try again.", "data": { "code": "NETWORK_ERROR", "httpStatus": 0 } }
```

The server never sends `NETWORK_ERROR`. The client sets it. `<QueryState>`, `<DataTable>`, `form.formError` and the other error displays show this message, not a parse error such as `Unexpected token '<'`. When the server is back, `retry()` or `refetch()` loads the data. To show your own text, check the error with the auto-imported `isNetworkError()`:

```vue
<template #error="{ error, retry }">
  <p v-if="isNetworkError(error)">You are offline. <button @click="retry">Try again</button></p>
  <p v-else>{{ error.message }}</p>
</template>
```

An error that the server sends as tRPC JSON keeps its own code and message, also with a 5xx status.

## Calls from an older build

```json
{ "message": "No procedure found on path \"post.publish\"", "data": { "code": "CLIENT_OUTDATED", "httpStatus": 404, "buildId": "b3c1…" } }
```

A browser tab can stay open across a deploy. Its app then calls the API of the new build. `$api` sends the app's build ID with each call in the `x-nuxvel-build` header. When the tab calls a procedure that the new build does not have, and the build ID is not the current one, the error has the code `CLIENT_OUTDATED`, and `data.buildId` holds the live build. On the next navigation, the app reloads the page, so the tab gets the new build. This is the same reload that Nuxt does after its own check for a newer build, see [Open tabs after a deploy](./build.md#open-tabs-after-a-deploy).

The call itself still fails, so `form.formError` or the error state of the query shows the message until the user moves on. A call with no build ID, or with the current one, gets `NOT_FOUND` as usual.

To keep old tabs working, change a procedure in two releases. First add the new shape and keep the old one. Remove the old shape in the next release.

## Calling from the server

```ts
const posts = await useCaller().post.list();
const post = await useCaller().post.byId({ id: 1 });
```

`useCaller()` is auto-imported in server code: route handlers, jobs and actions. It calls procedures in the same process, with full types. You call a procedure directly (tRPC v11), not with `.query()` or `.mutate()`.

`useCaller()` has no user of its own. An `authedProcedure` that you call through it runs as the user of the current request. It throws `UNAUTHORIZED` when that request has no session. A job or a task has no session. There, call the action with `systemActor(...)`.

## Calling from the client

```vue
<script setup lang="ts">
const posts = $api.post.list.useQuery();
</script>
```

`$api` is the typed API of the app. It is auto-imported in components, pages, composables and plugins, and you can use it in templates. It finds the tRPC client of the current Nuxt app when you call a procedure, so call it where a composable can run: in `setup`, in a plugin or in route middleware. The client sends queries through an `httpBatchLink` with the same superjson transformer. One batch carries at most 10 queries. The client sends more queries in more requests. Each mutation goes in a request of its own, so that its response [names what it invalidated](#what-a-mutation-invalidates). The server refuses a bigger batch from any other client with `BAD_REQUEST`. During SSR it calls procedures in the same process, with the visitor's request headers. Thus an `authedProcedure` query renders signed in on the first load. A query that fails with `NOT_FOUND`, `FORBIDDEN` or `UNAUTHORIZED` during SSR renders its error state with HTTP 404, 403 or 401, see [Errors during server rendering](./frontend.md#errors-during-server-rendering).

Read data through `.useQuery()`, so that the result is cached. See [Caching queries](#caching-queries-pinia-colada). For a one-off call, `await $api.post.list.query()` also works.

```vue
<script setup lang="ts">
defineProps<{ post: RouterOutputs["post"]["byId"] }>();
</script>
```

To name the type of a procedure, use the auto-imported `RouterInputs` and `RouterOutputs` types. Do not write the shape by hand. `RouterInputs["post"]["update"]` is what `$api.post.update` takes.

## Caching queries (Pinia Colada)

```vue
<script setup lang="ts">
const route = useRoute();
const post = $api.post.byId.useQuery(() => ({ id: Number(route.params.id) }));
</script>

<template>
  <h1 v-if="post.data">{{ post.data.title }}</h1>
</template>
```

`.useQuery(input, options?)` runs Pinia Colada's `useQuery()` for the procedure and returns its result wrapped in `reactive()`. Read `post.data`, `post.error`, `post.status` and `post.state` without `.value`, in the script and in the template, and call `post.refetch()` to fetch again. Pass the input as a getter or a ref, so that the query fetches again when it changes. A procedure without input takes no argument: `$api.post.list.useQuery()`.

`options` are the options of Pinia Colada's `useQuery()`, without `key` and `query`: `enabled`, `staleTime`, `placeholderData` and the others. To wait until an input is ready, set `enabled`:

```ts
const results = $api.post.list.useQuery(() => ({ q: q.value }), { enabled: () => q.value !== "" });
```

Call `.useQuery()` in `setup`, as `useQuery()`. During SSR the query runs on the server, and the page does not fetch it again when it hydrates.

```vue
<script setup lang="ts">
const createPost = $api.post.create.useMutation({
  onSuccess: (post) => navigateTo({ name: "posts-id", params: { id: post.id } }),
});
</script>

<template>
  <UAlert v-if="createPost.error" color="error" :title="createPost.error.message" />
  <UButton :loading="createPost.isLoading" @click="createPost.mutate({ title: 'Hello', body: 'First post' })">
    Create
  </UButton>
</template>
```

`.useMutation(options?)` runs Pinia Colada's `useMutation()` for the procedure and returns its result wrapped in `reactive()`: `createPost.mutate()`, `createPost.data`, `createPost.error` and `createPost.isLoading`, without `.value`. `options` are the options of Pinia Colada's `useMutation()`, without `mutation`: `onMutate`, `onSuccess`, `onError`, `onSettled` and the others. Call it in `setup`, as `useMutation()`. After it succeeds, the queries of its namespace and of the tags it names fetch again. The option `invalidate` replaces them for this call, see [Frontend: invalidation](./frontend.md#invalidation).

nuxvel installs Pinia Colada. `useQuery`, `useMutation` and `useQueryCache` are auto-imported. Each procedure on `$api` builds their options, so you do not write a key by hand.

| Helper | Returns | Pass to |
|---|---|---|
| `$api.post.byId.useQuery(input, options?)` | the result of `useQuery`, in `reactive()` | |
| `$api.post.byId.queryOptions(input)` | `{ key, query }` | `useQuery` |
| `$api.post.create.useMutation(options?)` | the result of `useMutation`, in `reactive()` | |
| `$api.post.create.mutationOptions(options?)` | `{ mutation }` | `useMutation` |
| `$api.post.byId.key(input?)` | `["trpc", "post", "byId", input]` | cache reads and writes |
| `$api.post.key()` | `["trpc", "post"]` | invalidating a whole namespace |

`queryOptions()` with Pinia Colada's own `useQuery()` is the step below `.useQuery()`, and `mutationOptions()` with `useMutation()` the step below `.useMutation()`: use them to build the options yourself, for example to pass them to `useLiveQuery()` or `useActionForm($api.x)`. The `query` function passes the abort signal of Pinia Colada to tRPC, so a query that Pinia Colada cancels also cancels its request.

A key is `"trpc"`, then the router path, then the input:

- Calls with the same input share one cache entry.
- A shorter key matches all keys under it.
- No key collides with a key that you write by hand for a query that is not tRPC.

These helpers use the names `key`, `queryOptions`, `useQuery`, `mutationOptions`, `useMutation` and `then`. A router or procedure with one of these names fails `nuxt typecheck`. Rename it.

### What a mutation invalidates

```http
x-nuxvel-invalidates: %5B%5B%22post%22%2C%22list%22%5D%2C%5B%22posts%22%5D%5D
```

A mutation response names the tags that its actions invalidated, in the header `x-nuxvel-invalidates`: the [`invalidates`](./actions.md#invalidating-cached-values) of each action that committed, nested actions included, as URL-encoded JSON. Each tag is an array: `"post:list"` is `["post", "list"]`, `["post", { id: 1 }]` stays as it is, and a glob such as `"posts:*"` is the prefix before it, `["posts"]`. The value above is `[["post","list"],["posts"]]`. The header is missing when no action of the mutation declared `invalidates`, when the mutation fails, and on a query. The client of `$api` reads it and refetches the queries under each tag and under the mutation's namespace, see [Frontend: invalidation](./frontend.md#invalidation).

## Optimistic updates

```ts
const renamePost = $api.post.update.useMutation({
  optimistic: {
    key: (input) => $api.post.byId.key({ id: input.id }),
    apply: (post, input) => ({ ...post, title: input.title }),
  },
  onError: () => toast.add({ title: "Not saved" }),
});
```

`optimistic: { key, apply }` on `.useMutation()` or `.mutationOptions()` changes a cached query before the server answers. Call either inside `setup()`, because it reads the query cache.

1. Before the mutation runs, it cancels the query at `key(input)` and shows the result of `apply`.
2. If the mutation fails, it puts the previous value back.
3. When the mutation settles, it refetches the query, so the server's answer wins.

If the query is not in the cache yet, it changes nothing. Your own `onMutate`, `onError` and `onSettled` run after nuxvel's, so `onError` sees the value after the rollback. For a page of `paginated()` data, `apply` can be [`removeRow()`, `prependRow()` or `replaceRow()`](./frontend.md#patching-a-paginated-list).

## REST and OpenAPI

```ts
list: publicProcedure
  .openapi({ path: "/posts" })
  .input(paginationSchema.optional())
  .output(paginated(postSchema))
  .query(({ input }) => paginate(useDb().select().from(postTable).orderBy(desc(postTable.id)).$dynamic(), input)),
```

A procedure with `.openapi()` also answers as a plain REST endpoint, here `GET /api/v1/posts`. A query answers `GET` and a mutation `POST`. `paginated(postSchema)` is the output schema of a [paginated](./database.md#pagination) list. See [REST and OpenAPI](./openapi.md).

## API keys

```sh
curl https://blog.example.com/api/v1/me -H "Authorization: Bearer nxk_3q2x…"
```

A machine client signs in with an API key in place of a session cookie. An `authedProcedure` accepts the key over REST and over tRPC. The built-in `apiKeys` router creates, lists and revokes the keys of the signed-in user. See [API keys](./openapi.md#api-keys).

## Testing

```ts
import { actingAs, describe, expect, guest, it } from "@nuxvel/nuxt/testing";
import { userFactory } from "#nuxvel/factories";

describe("post router", () => {
  it("creates a post as the signed-in user", async () => {
    const { api } = actingAs(await userFactory());

    const post = await api.post.create({ title: "Hello", body: "" });

    expect(post.title).toBe("Hello");
  });

  it("rejects a guest", async () => {
    await expect(
      guest().api.post.create({ title: "Hello", body: "" }),
    ).rejects.toBeTrpcError("UNAUTHORIZED");
  });
});
```

`actingAs(user)` gives a typed caller that runs each procedure as that user. `guest()` gives a caller with no session.

To test a call that a machine client makes, pass `apiKey: true`. Each call then carries a new API key of the user in place of a session:

```ts
const { $fetch } = actingAs(await userFactory(), { apiKey: true });

const post = await $fetch("/api/v1/posts", { method: "POST", body: { title: "Hello", body: "" } });
```

## See also

- [Actions](./actions.md)
- [REST and OpenAPI](./openapi.md)
- [Validation](./validation.md)
- [Auth](./auth.md#protecting-trpc-procedures)
- [Security: rate limiting](./security.md#rate-limiting)
- [Frontend: forms](./frontend.md#forms)
- [Testing](./testing.md)
