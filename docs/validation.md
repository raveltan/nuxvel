# Validation

## Introduction

nuxvel validates input with [Zod](https://zod.dev) schemas. You write a schema once, in `shared/schemas/`, and use it in the browser and on the server. Actions, tRPC procedures, jobs, events and mail all validate their input with it. An invalid input gives one error shape everywhere, with a list of messages for each field.

## Defining a schema

```sh
nuxvel make:schema post title body:text author:references=user
```

`nuxvel make:schema` writes two files: the Drizzle table in `server/database/schema/post.schema.ts` (see [Database](./database.md#defining-a-table)), and the Zod schemas in `shared/schemas/post.ts`. Each field becomes a column and a Zod field of the same type. See [CLI: fields](./cli.md#fields) for the types and modifiers. The command above writes these schemas:

```ts
// shared/schemas/post.ts
import { z } from "zod";

export const postIdInput = z.object({
  id: z.number().int().positive(),
});

export const createPostInput = z.object({
  title: z.string().trim().min(1).max(255),
  body: z.string().trim().min(1),
  authorId: z.string().min(1),
});

export const updatePostInput = createPostInput.partial().extend({
  id: postIdInput.shape.id,
});

// Sent to the browser as the output of every procedure that uses it: list only columns every caller may see.
export const postSchema = z.object({
  id: z.number(),
  title: z.string(),
  body: z.string(),
  authorId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
```

`postSchema` is the full row. Its type is `PostRow`, and it has no input rules. A `json` field is `z.unknown()` in it, as in `PostRow`. If you change a column, change `postSchema` too.

The generated inputs are a start. Change them to fit your domain. In the blog of these guides, the action takes the author from the actor, so the client does not send `authorId`. A draft can also have an empty body. So remove `authorId` and change `body`:

```ts
// shared/schemas/post.ts
export const createPostInput = z.object({
  title: z.string().trim().min(1).max(255),
  body: z.string(),
});
```

Put the schemas of one domain in one file under `shared/schemas/`. nuxvel auto-imports every export of these files in `app/` and in `server/` code. You do not write an import statement to use them.

Files under `shared/` also run in the browser. Do not import these modules from a file under `shared/`:

- `drizzle-orm`, or a `drizzle-orm/*` subpath
- `#nuxvel/schema`
- `@nuxvel/nuxt/database`
- any file under `server/`

## Naming

Give the schemas of every domain the same names. An input schema ends in `Input`. A schema of an output shape ends in `Schema`. A router calls its single-row query `byId`.

| Schema | Shape |
| --- | --- |
| `postIdInput` | `{ id }`, the input of `byId` and `delete` |
| `createPostInput` | the fields that a new row takes |
| `updatePostInput` | `id`, plus the fields of `createPostInput`, each one optional |
| `postSchema` | the row itself, for example to parse a realtime payload |

`nuxvel make:schema` writes the four schemas. The router of `make:router --crud` and `make:resource` uses `postSchema` as its output schema.

## Validating input

```ts
// server/actions/posts/create-post.action.ts
export const createPostAction = defineAction({
  input: createPostInput,
  handler: async (input, ctx) => {
    // input is valid here
  },
});
```

Usually you do not call the schema yourself. These helpers validate their input with the schema you give them, and throw a `ValidationFailedError` when it fails:

- `defineAction()`, see [Actions](./actions.md)
- a tRPC procedure's `.input()`, see [API](./api.md)
- `defineJob()`, see [Queues](./queues.md)
- `defineEvent()`, see [Domain events](./events.md)
- `sendMail()`, see [Mail](./mail.md)

In a plain Nitro handler, pass the schema to h3's helpers:

```ts
// server/api/comments.post.ts
export default defineEventHandler(async (event) => {
  const input = await readValidatedBody(event, createCommentInput.parse);
  // ...
});
```

`readValidatedBody`, `getValidatedQuery` and `getValidatedRouterParams` answer an input that fails the schema as a `ValidationFailedError`.

## Validating a plain route

```ts
// server/api/posts/[slug]/comments.post.ts
import { z } from "zod";

export default defineValidatedHandler(
  {
    params: z.object({ slug: z.string() }),
    query: z.object({ notify: z.stringbool().optional() }),
    body: z.object({ body: z.string().trim().min(1) }),
  },
  async (event, { params, query, body }) => {
    // params, query and body are parsed here
  },
);
```

`defineValidatedHandler(schemas, handler)` is auto-imported on the server. It checks the route params, the query and the body against their schemas before the handler runs. Each schema is optional. A part without a schema is `undefined`. A part that fails its schema answers with HTTP 400 in the [error shape](#error-shape), and the handler does not run.

```ts
await $fetch("/api/posts/hello/comments", {
  method: "POST",
  body: { body: "Nice post" },
});
```

`$fetch` to the route is typed with the schema inputs, in the app and on the server. A `body` or a `query` that does not match fails `nuxt typecheck`. The params are not typed, because they are part of the path. A route that uses `defineEventHandler()` keeps the usual `$fetch` option types.

For the app's own API, use a tRPC procedure. Use `defineValidatedHandler()` for a plain route, for example a route that a third party calls.

## Rich text

```ts
// shared/schemas/post.ts
import { z } from "zod";

export const createPostInput = z.object({
  title: z.string().trim().min(1).max(255),
  body: richText({ max: 20_000, profile: "rich" }),
});
```

`richText({ max, profile })` validates an HTML field that users write. It is auto-imported in `shared/`, in the app and on the server.

The schema first checks the length of the input. Input longer than `max` characters fails with the message `Too big: expected string to have <=20000 characters`. The default `max` is 10 000.

Then the schema cleans the HTML with [`sanitizeHtml()`](./security.md#sanitizing-html), with the same `profile`. It does not report the parts that it removes:

- A `<script>` or an event handler, such as `onerror`, is removed.
- A link that is not `http:`, `https:` or `mailto:` loses its `href`.
- Every link gets `rel="nofollow ugc noopener"`.

The parsed value is a `SanitizedHtml`. Your action stores HTML that is already clean, and [`<SafeHtml>`](./frontend.md#rendering-html) renders it.

A factory file runs outside Nuxt. It imports `sanitizeHtml` from `@nuxvel/nuxt/factories`, and `nuxvel make:factory` writes this for a `$type<SanitizedHtml>()` column. See [Factories](./testing.md#factories).

A `richText()` field works through `$trpc`, the REST endpoints and the test helpers. The XSS validator of `nuxt-security` is off on these routes, because the schema cleans the HTML. See [Security headers](./security.md#security-headers).

## Error shape

```ts
{
  code: "VALIDATION_ERROR",
  message: "Invalid input",
  fields: {
    title: ["Too small: expected string to have >=1 characters"],
    body: ["Invalid input: expected string, received undefined"],
  },
}
```

A `ValidationFailedError` answers with HTTP 400 and the tRPC code `BAD_REQUEST`. Its `fields` maps each invalid path to its list of messages. A nested path uses dots, for example `author.name`. The messages come from Zod.

One validation failure has five names:

| Name | What it is |
|---|---|
| `ValidationFailedError` | The error class. Throw it on the server with a `ZodError`. |
| `ValidationError` | The type of the wire shape `{ code, message, fields }`. |
| `toValidationError()` | Builds a `ValidationError` from a `ZodError` and does not throw. |
| `BAD_REQUEST` | The tRPC code of the error, and the code that `isTaxonomyError(error, "BAD_REQUEST")` narrows on. |
| `VALIDATION_ERROR` | The `code` in the body that a plain Nitro handler sends. |

A tRPC procedure sends the `fields` map as `error.data.fields`. It does this in production too. It sends `fields` in these cases:

- The `.input()` schema of the procedure fails.
- An action that the procedure calls throws `ValidationFailedError`.
- A write violates a unique constraint on a single column. The key is the column's name in the Drizzle schema, for example `name`.

A plain Nitro handler sends the object above as the response's `data`.

### Messages in the locale

The messages of an action and of a tRPC procedure's `.input()` are in the [request locale](./i18n.md#the-locale-on-the-server). For a call from `/zh/posts`, `title: z.string().min(3)` gives `数值过小：期望 string >=3 字符`. nuxvel uses the built-in locales of Zod, for example `zhCN`. A `message` or an `error` that you set on a schema stays the same in each locale. See [Internationalization: validation messages](./i18n.md#validation-messages).

[`useActionForm()`](./frontend.md#forms) shows each message under the matching form input.

## Using a schema directly

```ts
const result = createPostInput.safeParse(input);

if (!result.success) {
  throw new ValidationFailedError(result.error);
}
```

`ValidationFailedError` is auto-imported on the server. Its constructor takes the `ZodError`.

```ts
const error = toValidationError(result.error);
```

`toValidationError()` is also auto-imported on the server. It builds the same `{ code, message, fields }` object, but does not throw it. Use it when you only want to show the messages.

## Testing

```ts
import { expect, runAction } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { userFactory } from "../../server/factories/users.factory";

describe("create post", () => {
  it("rejects an empty title", async () => {
    const author = await userFactory();

    await expect(
      runAction("posts.create-post", { title: "", body: "" }, { actingAs: author }),
    ).rejects.toHaveValidationErrors("title");
  });
});
```

`toHaveValidationErrors(...fields)` passes when the error has messages for each field that you name. The matcher ignores fields that you do not name.

To check the messages, pass one object. Each value is a string, a `RegExp` or an asymmetric matcher. A field passes when one of its messages matches. A failed check prints the expected and the received message of each field.

```ts
await expect(
  runAction("posts.create-post", { title: "", body: "" }, { actingAs: author }),
).rejects.toHaveValidationErrors({ title: /required|too small/i, body: expect.any(String) });
```

The matcher also accepts the error of a REST 400 that `actingAs(user).$fetch()` rejects with:

```ts
await expect(
  actingAs(author).$fetch("/api/v1/posts", { method: "POST", body: { title: "" } }),
).rejects.toHaveValidationErrors("title");
```

## See also

- [Actions](./actions.md)
- [API (tRPC)](./api.md)
- [Frontend: forms](./frontend.md#forms)
- [Testing](./testing.md#expecting-failures)
