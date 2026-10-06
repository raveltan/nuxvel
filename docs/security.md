# Security

## Introduction

nuxvel protects every app with secure defaults. It sends strict security headers, rejects cross-origin tRPC mutations, checks the environment at boot and removes console calls from the production browser bundle. This page also shows how to rotate secrets, how to sign URLs, how to rate limit routes, procedures and actions, and how to handle content that users write.

## Security headers

```
content-security-policy: default-src 'none'; script-src 'self' 'strict-dynamic' 'nonce-...'; ...
```

nuxvel installs [`nuxt-security`](https://nuxt-security.vercel.app) with its `strict` preset. Do not add it to `modules` yourself. Every response carries the headers of the strict preset:

- A nonce-based `Content-Security-Policy` that denies everything by default.
- HSTS (`Strict-Transport-Security`).
- `X-Content-Type-Options: nosniff`.
- `X-Frame-Options: DENY`.
- A locked-down `Permissions-Policy`.
- No `X-Powered-By` header.

With [Nuxt UI](./frontend.md#nuxt-ui) on, the production `style-src-attr` allows only seven `style` attributes, by their hashes. Nuxt UI renders these fixed inline styles on the server:

- An empty `style` attribute, on the icons.
- `pointer-events:none;`, on the value or the placeholder of a `USelect`.
- The visually hidden style, on the hidden inputs of a `UCheckbox`, a `USwitch` and a `URadioGroup`, and on the hidden native `<select>` of a `USelect`, when the control has a `name`.
- `outline:none;`, on the root of a `URadioGroup`.
- `caret-color:transparent;`, on the date segments of a `UInputDate`.
- `transform:translateZ(0);` on the root of a `UProgress`, and `transform:translateX(-100%);` on its bar at 0%.

These values do not change from one control to the next. A `UProgress` with another value on the server is blocked: render it at 0 on the server, or in `<ClientOnly>`. Your own `style-src-attr` replaces this value.

Nuxt UI also adds one `<style>` element with the theme colours (`--ui-color-primary-500` and the other colour variables). On a server-rendered page, the nonce of the page covers it. On a route with the [`client` preset](./rendering.md#rendering-presets), the browser adds the element with no nonce, and the browser would block it.

The text of this element depends only on `ui.colors` and `ui.prefix` of the app config, which are fixed when you build the app. So nuxvel computes the text during the build, from the `app.config.ts` files of all layers and the defaults of Nuxt UI, and adds its sha256 hash to `style-src`. A hash allows exactly this text and nothing else, so `style-src` has no `'unsafe-inline'`. A nonce does not work here, because the browser creates the element before any code of yours can give it one. When you change `ui.colors`, the next build gives a new hash. A `style-src` that you set in your own `security` options still gets the hash, unless it has `'unsafe-inline'`: a hash next to it would make the browser ignore `'unsafe-inline'`.

Nuxt UI also turns on the `disableTransition` option of `@nuxtjs/color-mode`. On each switch of the colour mode, the module adds a `<style>` element with no nonce. The element stops the CSS transitions for one frame, and it is removed again. Its text is fixed, so nuxvel adds the sha256 hash of this text to `style-src`, also when the app config has no `ui.colors`. The strict CSP allows the switch and still has no `'unsafe-inline'`.

The XSS validator of `nuxt-security` is off for incoming [webhooks](./webhooks.md). nuxvel checks webhooks by their signature.

The XSS validator of `nuxt-security` is also off for the tRPC endpoint (`/api/trpc/**`), the [REST endpoints](./openapi.md) (`<restPrefix>/**`) and the call route of the [test helpers](./testing.md). The validator refuses each request body that contains an HTML attribute, such as `<a href>` or `<p class>`, with HTTP 400. It does this before the schema runs, so a [`richText()`](./validation.md#rich-text) field cannot get its value. This change is safe for these reasons:

- Each input of a procedure goes through its Zod schema. A REST call runs the same procedure, with the same schema.
- `richText()` cleans the HTML with `sanitizeHtml()`. It removes `<script>`, event handlers such as `onerror`, and `javascript:` links.
- A plain `z.string()` field keeps the HTML as text. Vue escapes text when it renders it. The app renders HTML only from a `SanitizedHtml`, with `<SafeHtml>`.

The validator stays on for all other routes.

The [API reference page](./openapi.md#the-api-reference-page) at `<restPrefix>/docs` sends its own `Content-Security-Policy`. It allows one pinned Scalar script from jsDelivr, inline styles, requests to the app, and images and fonts from the app or `data:` URLs.

### Headers in development

In development only, nuxvel changes three things:

- `style-src` is `'self' 'unsafe-inline'`, with no hashes, so that Nuxt DevTools can style its panel and Vite can add the styles of the page.
- The CSP has no `upgrade-insecure-requests`.
- The server sends no HSTS header.

Thus the dev server also works over plain HTTP from another host, such as a LAN IP or a phone. Production keeps the nonce, `upgrade-insecure-requests` and HSTS.

Your own `style-src`, `upgrade-insecure-requests` or `strictTransportSecurity` under `security` still wins in development.

## Overriding the preset

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["@nuxvel/nuxt"],
  security: {
    headers: {
      contentSecurityPolicy: {
        "img-src": ["'self'", "https://images.example.com"],
      },
    },
  },
});
```

The preset is a default. Change it under the `security` key in `nuxt.config.ts`. Your config wins over the preset.

nuxvel also sets two `nuxt-security` options that you can change:

| Option | nuxvel default | Change |
|---|---|---|
| `security.strict` | `true` | set `false` for the non-strict preset |
| `security.rateLimiter` | `false` | set an object to turn on the rate limiter of `nuxt-security` |

To override headers for some routes only, use Nuxt's `routeRules`:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  routeRules: {
    "/embed/**": { security: { headers: { xFrameOptions: "SAMEORIGIN" } } },
  },
});
```

## Console calls in the browser bundle

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  security: {
    removeLoggers: { consoleType: ["log", "debug"] },
  },
});
```

A production build removes these statements from your own client code:

- `console.log`, `console.info`, `console.debug`, `console.warn` and `console.error`.
- `debugger`.

Code in `node_modules` keeps them. A development build keeps them too. Thus no debug output that you forget reaches the browsers of your users.

Set `security.removeLoggers` to change this. Set `false` to keep all console calls. Set an object, as above, to remove only some types. Your value replaces the nuxvel value.

The build finds `debugger` with a plain text match over your client source. It does not parse the code. Thus the build removes the word wherever it occurs:

- The string `"debugger mode"` ships as `" mode"`.
- The identifier `debuggerPanel` becomes `Panel`.

To prevent this, rename the identifier or string. Or add the file to `removeLoggers.external`, next to your own `consoleType`. Paths are relative to the app root. The build does not change a listed file at all, and keeps its console calls too.

## Cross-origin mutations

```
POST /api/trpc/post.create   Origin: https://evil.example.com
→ 403 Cross-origin mutation rejected
```

nuxvel checks the origin of every tRPC **mutation**, also when a [REST endpoint](./openapi.md) calls it. When the `Origin` header does not match the host that the request went to, nuxvel rejects the request with `FORBIDDEN`. The procedure does not run. This check stops cross-site request forgery (CSRF).

nuxvel also rejects a mutation when the browser sends `Sec-Fetch-Site: cross-site` or `same-site`. This covers a link, a redirect or a form GET from another site, which sends no `Origin`. The check reads the request, so it also applies to `useCaller()` inside that request.

Behind a reverse proxy, nuxvel compares the origin with the first value of `X-Forwarded-Host`. Without that header, it uses `Host`. For example, a proxy serves the app at `https://app.example.com` and talks to it on `localhost:3000`. The app still accepts its own mutations. A browser cannot forge `X-Forwarded-Host` cross-origin: a custom header needs a CORS preflight, and the app never grants it.

These requests pass without a check:

- Queries.
- Requests without an `Origin` header and without a cross-site `Sec-Fetch-Site` header, such as server-to-server clients, and `useCaller()` in a job or a task.
- Requests with an [API key](./openapi.md#api-keys) in `Authorization: Bearer nxk_…`. A browser cannot send an `Authorization` header cross-origin without a CORS preflight, and the app never grants it. An `authedProcedure` then signs in with the key only, not with the session cookie.

Better Auth does the same check on its own endpoints.

## Error details

```json
{ "message": "Something went wrong (ref: 3f1c9a2e-…)" }
```

An unexpected error never sends its message, its stack, its `cause` or its SQL to the client. The client gets a generic message and the request id. The real error goes to the log and to error tracking with the same request id. A procedure, a REST call, a plain Nitro handler, a webhook and a server-rendered page all follow this rule, in development too. See [What the client sees](./api.md#what-the-client-sees).

## Env validation at boot

```
nuxvel: invalid environment:
  NUXT_AUTH_SECRET: Too small: expected string to have >=32 characters
```

The app does not start with a missing or weak secret. Before Nitro accepts a request, nuxvel checks these variables with Zod:

| Variable | Rule |
|---|---|
| `NUXT_DATABASE_URL` | required |
| `NUXT_AUTH_SECRET` | required, at least 32 characters |
| `NUXT_LOG_LEVEL` | optional, one of `silent`, `fatal`, `error`, `warn`, `info`, `debug`, `trace` |
| `NUXT_LOG_FORMAT` | optional, `pretty` or `json` |

The check reads the database, Redis, mail and storage settings as the server's runtime config resolves them. Thus a `runtimeConfig.databaseUrl` also counts. The error names each invalid variable.

With `NODE_ENV=production`, the check also requires the services that would otherwise fail later or fall back to localhost:

| Variable | Required when |
|---|---|
| `NUXT_REDIS_URL` | always in production |
| `NUXT_SITE_URL` | always in production |
| `NUXT_AUDIT_CHAIN_SECRET` | always in production, at least 32 characters |
| `NUXT_OG_IMAGE_SECRET` | `seo.ogImage` is on |
| `NUXT_MAIL_URL` | always in production |
| `NUXT_STORAGE_URL` and `NUXT_STORAGE_BUCKET` | `server/uploads/` defines an upload |
| `NUXT_AUTH_<PROVIDER>_CLIENT_ID` and `NUXT_AUTH_<PROVIDER>_CLIENT_SECRET` | `nuxvel.auth.social` turns on that provider, for example `NUXT_AUTH_GITHUB_CLIENT_ID` for `github` |

The auth mails use the origin in `NUXT_SITE_URL`, so a forged `Host` header cannot send a reset link to another host.

```
nuxvel: invalid environment:
  NUXT_REDIS_URL: Required in production
```

Before it stops, the server logs the problems as one `fatal` line with the tag `env`. The line has a hint for each variable and no stack. Thus a log collector shows why the container did not start:

```
{"time":"…","level":"fatal","tag":"env","msg":"invalid environment: NUXT_REDIS_URL: Required in production","variables":["NUXT_REDIS_URL"],"problems":[{"variable":"NUXT_REDIS_URL","problem":"Required in production","hint":"Set it to the Redis URL, e.g. redis://redis:6379"}]}
```

These commands use the same rules:

- `nuxvel key:generate` writes a secret of the correct strength.
- `nuxvel doctor` checks your shell and `.env` before you deploy. It shows the same hint under each problem.
- Every CLI command that runs inside the app does the same check before it builds.

To run the check in your own code, import from `@nuxvel/nuxt/env`:

| Export | Use |
|---|---|
| `checkEnvironment(settings)` | returns one problem for each invalid variable |
| `environmentSettings(process.env, runtimeConfig)` | builds the `settings` for `checkEnvironment()` |
| `envSchema` | the Zod schema of the check |
| `envHint(variable)` | the hint for a variable |

## Rotating secrets

```sh
nuxvel key:rotate NUXT_AUTH_SECRET
```

`nuxvel key:rotate` replaces a secret and keeps the previous value for a grace period of 30 days. During that period, the previous value continues to verify. Thus a rotation of `NUXT_AUTH_SECRET` signs out nobody. Two-factor sign-in continues to work too. The built-in schedule `nuxvel.auth.reencrypt-two-factor` encrypts the two-factor secrets of each user again with the new secret. Make sure it ran before the grace period ends. See [Auth](./auth.md#rotating-the-auth-secret) and [CLI](./cli.md#nuxvel-keyrotate-name).

`NUXT_AUDIT_CHAIN_SECRET` is an exception: `key:rotate` refuses it. See [Audit log](./audit.md#the-chain-secret). `NUXT_OG_IMAGE_SECRET` is the other one. See [SEO](./seo.md#the-signing-secret).

Your own signing secrets get the same rotation when you read them with `useSecrets(name)`:

```ts
import { createHmac } from "node:crypto";

const sign = (secret: string, body: string) =>
  createHmac("sha256", secret).update(body).digest("hex");

const [current] = useSecrets("NUXT_WEBHOOK_SECRET");
const signature = sign(current, body);

const valid = useSecrets("NUXT_WEBHOOK_SECRET").some(
  (secret) => sign(secret, body) === incoming,
);
```

`useSecrets()` is auto-imported on the server. It returns the current value first. While the grace period lasts, it also returns the previous value. Sign with the first value. Verify against all values.

`nuxvel key:rotate NUXT_WEBHOOK_SECRET` then rotates the secret. Data that the old secret signed continues to verify. The command writes `.env`, so the server uses the new value after it restarts. The previous value stops verifying when its grace period ends.

`useSecrets()` always returns at least the current value. When the variable has no value, it throws `NUXT_WEBHOOK_SECRET is not set`.

## Signed URLs

Use a signed URL for an invite link, an unsubscribe link or an "approve from email" link. Only your server can make the link, and the link expires.

```ts
const link = `${origin}${signedUrl(`/api/invites/${invite.id}/accept`, { expiresIn: 7 * 24 * 60 * 60 })}`;
```

`signedUrl(path, { expiresIn })` adds the `expires` and `signature` query parameters to the path. `expiresIn` is a number of seconds. The signature covers the path, all query parameters and the expiry time. The function returns a path. Put your origin in front of it for a link in an email.

The route that receives the link calls `requireSignature(event)` first:

```ts
// server/api/invites/[id]/accept.get.ts
export default defineEventHandler((event) => {
  requireSignature(event);

  return acceptInvite(getRouterParam(event, "id"));
});
```

`requireSignature()` throws a `ForbiddenError` with the message `Invalid signature` when the signature is missing or wrong, or when a part of the URL changed. It also throws `Invalid signature` when the request path has `\`, `.` or `..` segments or `%2e`. The signature covers the exact path that the route receives. It throws a `ForbiddenError` with the message `This link expired` when the link expired. A route answers HTTP 403, and a tRPC procedure answers `FORBIDDEN`.

When the link opens a page, the page sends the `expires` and `signature` query parameters to a procedure. Build that procedure with `signedProcedure()`:

```ts
// server/trpc/routers/invite.router.ts
const inviteLink = signedProcedure({
  input: z.object({ id: z.number(), expires: z.string(), signature: z.string() }),
  path: ({ id }) => `/invites/${id}`,
  actor: "invite-link",
});

export const inviteRouter = {
  show: inviteLink.query(({ input }) => findInvite(input.id)),
  accept: inviteLink
    .input(z.object({ name: z.string() }))
    .mutation(({ input }) => acceptInviteAction(input)),
};
```

- `input` is the schema of the link fields. It must include `expires` and `signature`.
- `path` makes the signed path from the input, without `expires` and `signature`. The procedure adds them and calls `requireSignature()` before the body runs. Encode a string field with `encodeURIComponent`, for example `` path: ({ slug }) => `/invites/${encodeURIComponent(slug)}` ``. A path that the URL parser changes throws `FORBIDDEN`.
- `actor` is the name of a system actor. The body runs as `systemActor(actor)`, also when the caller is signed in. `ctx.user` is `null`. An action that the body calls runs as that actor, so audit rows show `invite-link`.

Add more input fields with `.input()` after it. A procedure that must check the link in a different way can call `requireSignature(path)` with a path it makes itself.

Both functions are auto-imported on the server. They sign with `NUXT_AUTH_SECRET` through `useSecrets()`. After `nuxvel key:rotate NUXT_AUTH_SECRET`, links that the previous secret signed stay valid until the grace period ends.

## Rate limiting

| Name | What it is | Use it to |
|---|---|---|
| `defineRateLimit(options)` | a named limit, one file under `server/rate-limits/` | share one budget between several places. See [Shared limits](#shared-limits). |
| `rateLimit(options)` | a hook for a route or a procedure. An action takes the same options in its `rateLimit` option | limit that route, procedure or action. See [Limiting a route, procedure or action](#limiting-a-route-procedure-or-action). |
| `rateLimiter(name)` | the counter of a named limit | record one attempt with `consume(key)` in your own code. See [Shared limits](#shared-limits). |

nuxvel keeps its rate limit counts in Redis, so all instances of the app share one count. The rate limiter of `nuxt-security` is off by default. In functional tests, the counts are separate from the counts of the dev server, and `@nuxvel/nuxt/testing/setup` clears them after every test.

<a id="where-its-used"></a>

### Limiting a route, procedure or action

```ts
// server/api/posts/search.get.ts
import { ilike } from "drizzle-orm";
import { postTable } from "#nuxvel/schema";

export default defineEventHandler({
  onRequest: [rateLimit({ points: 30, window: { minutes: 1 }, by: "ip" })],
  handler: (event) =>
    useDb().select().from(postTable).where(ilike(postTable.title, `%${getQuery(event).q}%`)),
});
```

```ts
// server/trpc/routers/post.router.ts
create: authedProcedure
  .use(rateLimit({ points: 5, window: { minutes: 1 }, by: "user" }))
  .output(postSchema)
  .action($actions.posts.createPost),
```

```ts
// server/actions/comments/create-comment.action.ts
import { z } from "zod";
import { commentTable } from "#nuxvel/schema";

export const createCommentAction = defineAction({
  input: z.object({ postId: z.number().int().positive(), body: z.string().min(1) }),
  rateLimit: { points: 3, window: { minutes: 1 }, by: ({ input }) => `post:${input.postId}` },
  handler: (input, ctx) => insertOne(commentTable, { postId: input.postId, body: input.body, authorId: ctx.actor.id }),
});
```

`rateLimit({ points, window, by })` allows `points` attempts per sliding `window`, for each `by` key. It is auto-imported on the server. An action takes the same options as its `rateLimit` option.

Put the limit where it applies. nuxvel names the counter for you:

| Place | Counter name |
|---|---|
| route handler, in `onRequest` | the method and route pattern, such as `GET /api/posts/search` |
| tRPC procedure, in `.use()` | the procedure path, such as `post.create` |
| action, in `rateLimit` | the action name |
| upload, in the `rateLimit` option of `defineUpload()` | the upload name |

`window` takes `seconds`, `minutes`, `hours` and `days`. Give at least one unit. Several units add up, so `{ hours: 1, minutes: 30 }` is 90 minutes.

`by` selects who shares one budget:

| `by` | Key |
|---|---|
| `"ip"` | the client IP. All IPv6 addresses in one /64 network share one budget |
| `"user"` | the signed-in user, or the user actor of an action |
| a function | the string that the function returns |

A key function gets `{ event }` in a route handler and in a procedure. In a procedure, this is the request, not tRPC's `{ ctx, input }`. In an action, the key function gets the parsed `{ input, actor }`.

`by: "user"` has these conditions:

- On a procedure, it compiles only after `authedProcedure`.
- In a route handler, a signed-out request gets HTTP 401.
- In an action, an actor that is not a user causes a plain `Error` (HTTP 500). Such a call is a bug.

Over the limit, each place throws `RateLimitedError`. It answers with HTTP 429, a `Retry-After` header and `data.retryAfter`, in seconds.

```
RateLimit-Limit: 30
RateLimit-Remaining: 29
RateLimit-Reset: 60
```

Every response of a limited route, procedure or action has these headers. The names come from the IETF draft for rate limit headers:

| Header | Value |
|---|---|
| `RateLimit-Limit` | the attempts allowed per window |
| `RateLimit-Remaining` | the attempts left in the window |
| `RateLimit-Reset` | the seconds until the oldest attempt leaves the window |

A 429 also has `Retry-After`. `rateLimiter(name).consume(key)` and the `login` limit send the same headers when they run inside a request.

### Shared limits

```ts
// server/rate-limits/export.rate-limit.ts
export const exportRateLimit = defineRateLimit({ points: 10, window: { hours: 1 } });
```

A limit that several places share lives in its own file under `server/rate-limits/`. `defineRateLimit` is auto-imported. The file path is the name of the limit, like every other definition. The file above defines the limit `export`.

The auto-imported `$rateLimits` namespace holds each shared limit under its path. Each path segment is in camelCase and has no kind suffix. `$rateLimits.export` is the limit in the file above. Go to definition on `$rateLimits.export` opens the limit file. `$rateLimits` is available on the server only.

Use a shared limit in three ways:

```ts
onRequest: [rateLimit({ limit: "export", by: "user" })],
```

```ts
defineAction({ ..., rateLimit: { limit: "export", by: "user" } });
```

```ts
await rateLimiter("export").consume(`user:${user.id}`);
await rateLimiter($rateLimits.export).consume(`user:${user.id}`);
```

In `rateLimit()` and in an action, give `{ limit, by }` in place of `points` and `window`. `limit` is the name of the limit or its definition. `rateLimiter(name)` is auto-imported. It also takes the definition, from `$rateLimits` or an import, in place of the name. Its `consume(key)` records one attempt for any key that must share the budget.

Every use counts under the name of the limit. All keys share one namespace:

| Source | Key |
|---|---|
| `by: "ip"` | `ip:<address>`, or `ip:<prefix>::/64` for an IPv6 client |
| `by: "user"` | `user:<id>` |
| a key function | its string, as it is |
| `consume(key)` | `key`, as it is |

Thus the three calls above spend one budget per user. An action with `by: ({ input }) => input.email` shares a budget with `rateLimiter("export").consume(email)`.

The types know every limit name from the files, plus `login`, `channel-join` and `api-key`. A limit name that no file defines fails `nuxt typecheck`.

Over the limit, the call throws `RateLimitedError` (HTTP 429). Its `retryAfter` is the number of seconds until the next attempt fits.

A limit keeps no data that is worth keeping under its name. Thus a `renamed()` alias in `server/rate-limits/` stops the server. Move the file, and the counters start again from zero.

### The API key limit

```ts
// server/rate-limits/api-key.rate-limit.ts
export const apiKeyRateLimit = defineRateLimit({ points: 600, window: { minutes: 1 } });
```

The `api-key` limit exists by default: 60 calls per minute. Each API key has its own count, under the key `api-key:<key id>`. Every `authedProcedure` call made with the key spends one. See [API keys](./openapi.md#rate-limit). Add `server/rate-limits/api-key.rate-limit.ts` to replace it.

### Client IP behind a proxy

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["@nuxvel/nuxt"],
  nuxvel: {
    security: { trustProxy: 1 },
  },
});
```

`by: "ip"`, the `login` limit, the IP allow-list of [maintenance mode](./maintenance.md) and the sessions of Better Auth use the client IP. By default, the client IP is the address of the connected peer. nuxvel ignores the `Forwarded` and `X-Forwarded-For` headers, so a client cannot forge its address.

Behind a proxy, the peer is the proxy. Set `nuxvel.security.trustProxy` to read the client IP from the `X-Forwarded-For` header:

| `trustProxy` | Client IP |
|---|---|
| `false` (default) | the connected peer |
| a number `n` | the `n`-th address of `X-Forwarded-For` from the right. Use the number of proxies in front of the app |
| `"loopback"` | the last address of `X-Forwarded-For`, but only on a request from a loopback address (127.0.0.0/8, ::1 or ::ffff:127.0.0.0/104), so from a proxy on the same machine. The peer otherwise. [A VPS deploy](./deploy.md#app-processes) sets it for Caddy |
| `true` | the first address of `X-Forwarded-For`. Use it only when every proxy replaces the `X-Forwarded-For` header that the client sends |

In `nuxt dev` (and `nuxvel dev`), the app runs in a worker behind the dev proxy of Nitro, so the worker has no peer address. There, nuxvel uses the last address of `X-Forwarded-For` as the peer, because the dev proxy adds it. The portless proxy of `nuxvel dev` also adds the address of the client to that header. A production build never does this.

nuxvel reads only `X-Forwarded-For`, in every mode. It ignores the `Forwarded` header. nginx, AWS ALB and Caddy add the client address only to `X-Forwarded-For`, and they send a `Forwarded` header from the client to the app unchanged. If nuxvel read that header, a client could choose its own address. By default, Caddy replaces `X-Forwarded-For` with the address it received. The environment variable `NUXT_NUXVEL_SECURITY_TRUST_PROXY` overrides the option at runtime.

`clientIp(event)` returns the same address in your own code. It is auto-imported on the server:

```ts
// server/api/posts/[id]/views.post.ts
export default defineEventHandler((event) => {
  useLogger("posts").info(`post viewed from ${clientIp(event)}`);
});
```

### The login limit

```ts
// server/rate-limits/login.rate-limit.ts
export const loginRateLimit = defineRateLimit({ points: 10, window: { minutes: 5 } });
```

The `login` limit exists by default: 5 attempts per minute. It sets how often one client can sign in or sign up. See [Auth](./auth.md#rate-limiting). Add `server/rate-limits/login.rate-limit.ts` to replace it.

### The channel-join limit

```ts
// server/rate-limits/channel-join.rate-limit.ts
export const channelJoinRateLimit = defineRateLimit({ points: 120, window: { minutes: 1 } });
```

The `channel-join` limit exists by default: 60 joins per minute. It sets how often one signed-in user, or one guest IP address, can join a realtime channel, with `POST /api/channels/join` or as one channel of a `GET /api/channels` open. See [Realtime: limits](./realtime.md#limits). Add `server/rate-limits/channel-join.rate-limit.ts` to replace it.

## Request size

nuxvel limits the size of every request body before any code reads it. The limits come from `nuxt-security`:

| Option | Default | Applies to |
|---|---|---|
| `security.requestSizeLimiter.maxRequestSizeInBytes` | `2000000` | all bodies except `multipart/form-data` |
| `security.requestSizeLimiter.maxUploadFileRequestInBytes` | `8000000` | `multipart/form-data` bodies |

A request whose `Content-Length` is at or over the limit gets HTTP 413. This applies to every method, PATCH included.

A request body without `Content-Length` (a chunked body) gets HTTP 411. The app cannot know the size of such a body before it reads it. Browsers, the tRPC client, the auth client and webhook senders always send `Content-Length`.

File uploads do not go through the app. The browser sends the file directly to the bucket with a [presigned URL](./storage.md#uploads).

On a [deployed server](./deploy.md#serving-the-app-with-caddy), Caddy also refuses a body over 8 MB with HTTP 413.

To turn the limit off for one route, for example a route that reads a streamed body, set `requestSizeLimiter: false` for it:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  routeRules: {
    "/api/stream-in": { security: { requestSizeLimiter: false } },
  },
});
```

## User content

Content that users write can contain HTML, SVG scripts or spreadsheet formulas. Clean it before you store it, show it or export it.

### Sanitizing HTML

```ts
// server/actions/posts/import-post.action.ts
import { z } from "zod";
import { postTable } from "#nuxvel/schema";

export const importPostAction = defineAction({
  input: z.object({ title: z.string().min(1), html: z.string() }),
  handler: (input, ctx) =>
    useDb()
      insertOne(postTable, {
        title: input.title,
        body: sanitizeHtml(input.html, { profile: "rich" }),
        authorId: ctx.actor.id,
      }),
});
```

`sanitizeHtml(html, { profile })` is auto-imported on the server. It keeps only the tags on an allowlist and removes everything else:

- `<script>` and `<style>` elements, with their content.
- Every attribute except `href` and `rel` on a link. This removes `onerror`, `onclick`, `style` and all other event handlers.
- A link `href` that does not start with `http:`, `https:` or `mailto:`. A `javascript:` link keeps its text but loses its `href`.
- A `rel` that the input gives. Every link gets `rel="nofollow ugc noopener"`.
- All other tags. Their text stays.

| Profile | Tags it keeps |
|---|---|
| `"basic"`, the default | `p`, `br`, `strong`, `b`, `em`, `i`, `u`, `s`, `code`, `a`, `ul`, `ol`, `li`, `blockquote` |
| `"rich"` | the `"basic"` tags, plus `h2`, `h3`, `h4`, `pre`, `hr` |

`sanitizeHtml()` returns a `SanitizedHtml`. This type is a `string` that only `sanitizeHtml()` makes. `SanitizedHtml` is auto-imported as a type on the server and in the app.

To clean a form field while it is validated, use [`richText()`](./validation.md#rich-text) in its schema.

Render a `SanitizedHtml` with `<SafeHtml :html>`. See [Frontend: rendering HTML](./frontend.md#rendering-html). The lint preset reports every `v-html` in the app.

### SVG uploads

An uploaded SVG file can run scripts. An upload refuses SVG files unless you set its `svg` option to `"rasterize"` or `"sanitize"`. `promoteUpload()` also limits the size and the number of elements of an SVG, so that one file cannot use the server for a long time. See [Storage: SVG files](./storage.md#svg-files).

### CSV exports

```ts
// server/api/posts/export.get.ts
import { postTable } from "#nuxvel/schema";

export default defineEventHandler(async (event) => {
  const rows = await useDb().select().from(postTable);

  setHeader(event, "content-type", "text/csv");

  return [
    "id,title,createdAt",
    ...rows.map((post) => [post.id, post.title, post.createdAt].map(csvSafe).join(",")),
  ].join("\n");
});
```

A spreadsheet runs a cell that starts with `=` as a formula. A user can write such a title to attack the person who opens the export. `csvSafe(value)` is auto-imported on the server. It formats one value as a CSV cell:

- A cell that starts with `=`, `+`, `-`, `@`, a tab or a carriage return gets a `'` in front. The spreadsheet shows it as text.
- `null` and `undefined` become an empty cell. A `Date` becomes its ISO string. An object becomes its JSON.
- A cell with a quote, a comma or a line break is quoted.

`nuxvel audit:export --format csv` writes every cell with `csvSafe()`.

## Testing

```ts
import { actingAs, expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { userFactory } from "#nuxvel/factories";

describe("post rate limit", () => {
  it("refuses the sixth post in a minute", async () => {
    const { trpc } = actingAs(await userFactory());

    for (let attempt = 0; attempt < 5; attempt++) {
      await trpc.post.create({ title: `Post ${attempt}`, body: "" });
    }

    await expect(trpc.post.create({ title: "One too many", body: "" }))
      .rejects.toBeTrpcError("TOO_MANY_REQUESTS");
  });
});
```

This test uses the `post.create` procedure with the limit of 5 per minute by user from [Limiting a route, procedure or action](#where-its-used). A new user gets a new budget, so each test run starts from zero.

`exhaustRateLimit(limit, identity)` spends every attempt of a shared limit for one identity. The identity is `{ user }` for a limit `by: "user"`, `{ ip }` for `by: "ip"`, or the string that a key function returns.

```ts
await exhaustRateLimit("export", { user });
await expect(actingAs(user).trpc.post.export()).rejects.toBeTrpcError("TOO_MANY_REQUESTS");
```

To spend the `rateLimit()` that you wrote inside a procedure, give the procedure of a test client. The helper spends the limit for the identity of that client, and it does not call the procedure.

```ts
await exhaustRateLimit(guest().trpc.tickets.public.open);
await expect(guest().trpc.tickets.public.open(input)).rejects.toBeTrpcError("TOO_MANY_REQUESTS");
```

The `rateLimit` of an upload has no helper. Ask for the upload URL in a loop until the upload refuses the request.

```ts
const ask = () => guest().fetch("/api/uploads/avatar", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ type: "image/png", size: 1024 }),
});

for (let attempt = 0; attempt < 5; attempt++) await ask();
expect((await ask()).status).toBe(429);
```

`signedUrl(path, { expiresIn })` signs a path in the app under test, so a test can open the link. `travelBy()` past `expiresIn` expires the link.

```ts
const link = await signedUrl(`/api/invites/${invite.id}/accept`, { expiresIn: 60 });
expect((await guest().fetch(link)).status).toBe(200);
```

See [Testing](./testing.md).

## See also

- [Auth](./auth.md)
- [Webhooks](./webhooks.md)
- [CLI](./cli.md)
- [Observability](./observability.md)
