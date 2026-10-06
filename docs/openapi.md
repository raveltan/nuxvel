# REST and OpenAPI

## Introduction

nuxvel can serve a tRPC procedure as a plain REST endpoint. Use it for clients that cannot use the tRPC client: a mobile app, a partner, a script. You call `.openapi()` on the procedure, and the procedure answers at `/api/v1/<path>` with plain JSON. The tRPC call stays as it was. A machine client signs in with an API key. nuxvel uses [`trpc-to-openapi`](https://github.com/mcampa/trpc-to-openapi) for this.

## Configuration

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["@nuxvel/nuxt"],
  nuxvel: {
    api: { restPrefix: "/api/rest" },
  },
});
```

| Option | Default | Value |
|---|---|---|
| `api.restPrefix` | `"/api/v1"` | The path that every REST endpoint starts with |
| `api.openapi` | not set | `{ title, version, description? }`. Turns on the [OpenAPI document](#the-openapi-document) |
| `api.docs` | `false` | Serves the [API reference page](#the-api-reference-page) in production too. It is always on in development |

## Exposing a procedure

```ts
// server/trpc/routers/post.router.ts
import { desc } from "drizzle-orm";
import { postTable } from "#nuxvel/schema";

export const postRouter = {
  list: publicProcedure
    .openapi({ path: "/posts", summary: "List posts", protect: false })
    .input(paginationSchema.optional())
    .output(paginated(postSchema))
    .query(({ input }) => paginate(useDb().select().from(postTable).orderBy(desc(postTable.id)).$dynamic(), input)),

  byId: publicProcedure
    .openapi({ path: "/posts/{id}", summary: "Get a post", protect: false })
    .input(postIdInput)
    .output(postSchema)
    .query(({ input }) => findOrFail(postTable, input.id)),
};
```

```
GET /api/v1/posts      → 200 { "rows": [{ "id": 1, "title": "Hello", ... }], "page": 1, "perPage": 20, "total": 1, "lastPage": 1 }
GET /api/v1/posts/1    → 200 { "id": 1, "title": "Hello", ... }
```

`.openapi(options)` works on every procedure builder, also before [`.action()`](./api.md#running-an-action). It takes the `openapi` meta of `trpc-to-openapi` without `method`:

| Option | Default |
|---|---|
| `path` | The procedure path, with each segment in kebab-case: `post.byId` is `/post/by-id`. A path starts with `/` and comes after `api.restPrefix`. |
| `summary` | None |
| `tags` | The first segment of the procedure path: `["post"]` for `post.byId` |
| `protect` | `true`. See below. |

A query answers `GET` and a mutation `POST`. A procedure without `.openapi()` has no REST endpoint.

```ts
update: authedProcedure.openapi({ path: "/posts/{id}" }).output(postSchema).action($actions.posts.updatePost),
```

To choose another method, such as `PATCH` or `DELETE`, set the meta by hand: `.meta({ openapi: { method: "PATCH", path: "/posts/{id}" } })`. `method` is `GET`, `POST`, `PATCH`, `PUT` or `DELETE`, and `path` is required there. Use `GET` only for a query. nuxvel rejects a mutation that a link from another site opens (`403 Cross-origin mutation rejected`). To change state from a link in a mail, use a [signed URL](./security.md#signed-urls).

`postSchema` is the row schema that `nuxvel make:schema` writes in `shared/schemas/post.ts`. Its type is `PostRow`, and it has no input rules, so every row that the database returns passes the output check. Use a row schema, not an input schema, as the output schema. See [Validation: naming](./validation.md#naming). `paginated(postSchema)` is the schema of the page that [`paginate()`](./database.md#pagination) returns.

`nuxvel make:router --crud` and `nuxvel make:resource` expose every procedure they write in this way: `GET /<name>`, `GET /<name>/{id}`, `POST /<name>`, `PATCH /<name>/{id}`, `DELETE /<name>/{id}` and, with `--soft-deletes`, `POST /<name>/{id}/restore`. With `--domain`, the path starts with the domain, such as `/parcel/crate`. Give `--no-openapi` to leave the endpoints out. See [CLI: `nuxvel make:router`](./cli.md#nuxvel-makerouter-name---crud).

`protect: false` tells the OpenAPI document that the endpoint needs no [API key](#api-keys). Set it on a `publicProcedure`. Without it, the document lists the endpoint as protected.

An exposed procedure needs these things:

- An `.output()` schema. The OpenAPI document is made from it.
- An `.input()` schema that is a `z.object()`, or no input.

A `{name}` segment in `path` fills the input field with the same name. A `GET` or `DELETE` reads the other fields from the query string. A `POST`, `PUT` or `PATCH` reads them from a JSON body. The request must then have `Content-Type: application/json`, else it gets HTTP 415. Number and boolean fields from the path or the query string are converted from their text. A `z.date()` field in a JSON body takes an ISO date string.

The response is plain JSON, not superjson. A `Date` arrives as an ISO string.

## The OpenAPI document

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  nuxvel: {
    api: { openapi: { title: "Blog API", version: "1.0.0", description: "Posts and comments" } },
  },
});
```

```
GET /api/v1/openapi.json
→ { "openapi": "3.1.0", "info": { "title": "Blog API", ... }, "servers": [{ "url": "/api/v1" }], "paths": { "/posts": ... } }
```

With `api.openapi` set, nuxvel serves an OpenAPI 3.1 document at `<restPrefix>/openapi.json`. It lists every procedure with `.openapi()` or `openapi` meta. The input and output schemas become the request and response schemas. The `operationId` is the procedure path with dashes, such as `post-byId`.

Give the document to a client generator, or write it to a file with [`nuxvel openapi:export`](./cli.md#nuxvel-openapiexport-file):

```sh
nuxvel openapi:export openapi.json
```

## The API reference page

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  nuxvel: {
    api: { openapi: { title: "Blog API", version: "1.0.0" }, docs: true },
  },
});
```

`<restPrefix>/docs` shows the document as a [Scalar](https://github.com/scalar/scalar) API reference. The page is on in development when `api.openapi` is set. Set `api.docs: true` to serve it in production too.

The page loads a pinned Scalar script from jsDelivr, with a subresource integrity hash. This page has its own `Content-Security-Policy`. It allows only that script, inline styles, requests to the app, and images and fonts from the app or `data:` URLs. The CSP of every other route does not change.

## Errors

```json
{
  "message": "Input validation failed",
  "code": "BAD_REQUEST",
  "data": {
    "code": "BAD_REQUEST",
    "httpStatus": 400,
    "path": "post.byId",
    "fields": { "id": ["Too small: expected number to be >0"] }
  },
  "issues": [{ "code": "too_small", "path": ["id"], "message": "Too small: expected number to be >0" }]
}
```

An error answers with the HTTP status of its tRPC code. The body is the tRPC error shape of [API errors](./api.md#errors), with `code` as the tRPC code name:

| Error | HTTP | Extra data |
|---|---|---|
| Invalid input, `ValidationFailedError` | 400 | `data.fields`, and `issues` for invalid input |
| `UnauthenticatedError` | 401 | |
| `ForbiddenError` | 403 | |
| `NotFoundError`, or no procedure at the path | 404 | |
| `ConflictError` | 409 | `data.fields` for a single-column conflict |
| `ActionError` | 422 | `data.actionCode` |
| `RateLimitedError` | 429 | `data.retryAfter` and a `Retry-After` header |

In [maintenance mode](./maintenance.md), every REST endpoint answers HTTP 503 with a `Retry-After` header before a procedure runs. The body is the plain route shape, with `data.code` set to `MAINTENANCE`, plus `data.message` and `data.retryAfter`.

## Authentication

An `authedProcedure` reads the session cookie over REST, as it does over tRPC. A mutation with a session cookie gets the same [origin check](./security.md#cross-origin-mutations): an `Origin` that does not match the host gets HTTP 403. A machine client uses an [API key](#api-keys) in place of a cookie.

## API keys

```sh
curl https://blog.example.com/api/v1/me \
  -H "Authorization: Bearer nxk_3q2x…"
```

An API key signs a machine client in as a user: a script, a CI job, a partner. Send it in the `Authorization` header as a bearer token. An `authedProcedure` accepts it over REST and over tRPC.

In a procedure called with a key:

- `ctx.user` is the user who owns the key.
- `ctx.actor` is `{ type: "api-key", id, userId }`. `id` is the key's ID and `userId` is the owner. `apiKeyActor()` makes this actor.
- Audit rows record the key as the actor.
- The [origin check](./security.md#cross-origin-mutations) does not apply.

An unknown, revoked or expired key gets HTTP 401. The request does not fall back to the session cookie.

### Creating a key

```vue
<script setup lang="ts">
const keys = $api.apiKeys.list.useQuery();
const createKey = $api.apiKeys.create.useMutation();
const newKey = ref<string>();

async function create() {
  newKey.value = (await createKey.mutateAsync({ name: "ci" })).key;
}
</script>
```

nuxvel adds the `apiKeys` router to the app router. It manages the keys of the signed-in user:

| Procedure | Input | Returns |
|---|---|---|
| `apiKeys.list` | | `{ id, name, lastUsedAt, expiresAt, createdAt }[]` |
| `apiKeys.create` | `{ name, expiresAt? }` | `{ id, name, expiresAt, key }` |
| `apiKeys.revoke` | `{ id }` | `{ id }`, or `NOT_FOUND` |

`create` returns the key only once. Show it to the user, and tell them to store it. nuxvel stores a SHA-256 hash of the key, never the key. A key without `expiresAt` does not expire. `revoke` deletes the key. A password reset and a password change delete every key of the user and end the other sessions of the user, so a stolen session and a key made from it do not survive recovery.

These procedures need a session cookie. A call made with an API key gets `FORBIDDEN`, so a leaked key cannot make new keys. An app router file named `api-keys.router.ts` hides this router.

To issue a key from the command line, use [`nuxvel key:issue`](./cli.md#nuxvel-keyissue-userid---name-name):

```sh
nuxvel key:issue 5b1c… --name ci
# nxk_3q2x…
# ✔ Issued the API key "ci" for user 5b1c…. Store it now: it is not shown again
```

### Policies and keys

```ts
// server/policies/posts.policy.ts
import { postTable } from "#nuxvel/schema";

export const postsPolicy = definePolicy(postTable, {
  update: (actor, post) =>
    post.authorId === (actor.type === API_KEY_ACTOR_TYPE ? actor.userId : actor.id),
});
```

For a key, `actor.id` is the key, not the user. A rule that checks ownership compares `actor.userId`. The actor has no `role`, so a rule that checks `actor.role` rejects a key. An action that writes `ctx.actor.id` into a user column needs the same change.

### Rate limit

Each key can make 60 calls per minute to `authedProcedure`s. The next call gets HTTP 429 with a `Retry-After` header. This is the built-in `api-key` [shared limit](./security.md#shared-limits). Add `server/rate-limits/api-key.rate-limit.ts` to change it:

```ts
// server/rate-limits/api-key.rate-limit.ts
export const apiKeyRateLimit = defineRateLimit({ points: 600, window: { minutes: 1 } });
```

### The `api_keys` table

```ts
// server/database/schema/api-keys.schema.ts
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { userTable } from "./auth.schema";
import { now } from "@nuxvel/nuxt/database";

export const apiKeysTable = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    keyHash: text("key_hash").notNull().unique(),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    lastUsedAt: timestamp("last_used_at"),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").notNull().defaultNow().$defaultFn(now),
  },
  (table) => [index("api_keys_user_id_idx").on(table.userId)],
);
```

A `create-nuxvel` app has this table. In an existing app, add the file, then run `nuxvel db:generate` and `nuxvel db:migrate`. A user's keys are deleted with the user. Declare the table in `server/privacy/`. See [Privacy](./privacy.md#framework-tables).

## Testing

```ts
import { actingAs, expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { postFactory, userFactory } from "#nuxvel/factories";

describe("posts over REST", () => {
  it("returns a post as JSON", async () => {
    const post = await postFactory({ title: "Hello" });

    const response = await guest().fetch(`/api/v1/posts/${post.id}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: post.id, title: "Hello" });
  });

  it("signs a client in with an API key", async () => {
    const response = await actingAs(await userFactory(), { apiKey: true }).fetch("/api/v1/me");

    expect(response.status).toBe(200);
  });
});
```

## See also

- [API](./api.md)
- [CLI: `nuxvel openapi:export`](./cli.md#nuxvel-openapiexport-file)
- [CLI: `nuxvel key:issue`](./cli.md#nuxvel-keyissue-userid---name-name)
- [Validation](./validation.md)
- [Security](./security.md)
- [Authorization](./authorization.md)
- [CLI: `nuxvel make:resource`](./cli.md#nuxvel-makeresource-name)
