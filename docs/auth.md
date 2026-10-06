# Auth

## Introduction

nuxvel signs users in with [Better Auth](https://www.better-auth.com), using email and password or a social provider such as GitHub or Google. Sessions live in Postgres. Use the helpers on this page to sign users up and in, to read the current user, and to protect pages and tRPC procedures.

## Auth tables

The starter creates five auth tables in `server/database/schema/auth.schema.ts`: `user`, `session`, `account`, `verification` and `two_factor`. They are ordinary Drizzle tables. Migrate them like any other table.

## Endpoints

nuxvel mounts the Better Auth handler at `/api/auth/*`. You do not register it. It serves the standard Better Auth routes:

| Route | Use |
|---|---|
| `/api/auth/sign-up/email` | create a user and sign them in |
| `/api/auth/sign-in/email` | sign in |
| `/api/auth/get-session` | read the current session |
| `/api/auth/sign-in/social` | start a sign-in with a social provider |
| `/api/auth/callback/<provider>` | receive the user back from a social provider |

The handler also serves the other Better Auth routes, such as sign-out, under the same path.

## Signing up and signing in

```ts
await authClient.signUp.email({ email, password, name });
await authClient.signIn.email({ email, password });
```

`authClient` is the Better Auth Vue client. It is auto-imported and configured for you.

Sign out with `useUser().signOut()`, not with `authClient.signOut()`. `authClient.signOut()` ends the session, but it does not clear the query cache. The data of the previous user then stays in the page. See [Reading the current user](#reading-the-current-user).

### The sign-in and sign-up forms

```vue
<!-- app/pages/sign-in.vue -->
<script setup lang="ts">
definePageMeta({ layout: "auth", middleware: "guest" });
</script>

<template>
  <h1>Sign in</h1>
  <AuthForm mode="sign-in" />
</template>
```

`<AuthForm>` renders the form of a sign-in, sign-up, forgot-password or reset-password page. The starter ships `app/pages/sign-in.vue`, `sign-up.vue`, `forgot-password.vue`, `reset-password.vue` and `verify-email.vue` with it.

| `mode` | Fields | Calls | On success |
|---|---|---|---|
| `"sign-in"` | email, password | `authClient.signIn.email()` | opens `/` |
| `"sign-up"` | name, email, password | `authClient.signUp.email()` | opens `/`, or `/verify-email?email=...` while [email verification](#email-verification) is on |
| `"forgot-password"` | email | `authClient.requestPasswordReset()` with `redirectTo: "/reset-password"` | shows "Check your inbox" |
| `"reset-password"` | new password | `authClient.resetPassword()` with the `token` query parameter | opens `/sign-in` |

- Each page in the table opens in the locale of the form's page. On `/zh/sign-in`, a sign-in opens `/zh`. The text of the form is in the locale of the page. See [Internationalization: the nuxvel components](./i18n.md#the-nuxvel-components).
- The form uses [`useActionForm()`](./frontend.md#forms). It gets field validation, a pending state and the server's error message, like any other form.
- A field error shows under its field. A refusal from Better Auth, such as a wrong password or an email that is taken, shows above the button.
- The password field has `autocomplete="current-password"` in sign-in mode and `autocomplete="new-password"` in sign-up mode.
- In sign-in mode, a user with [two-factor sign-in](#two-factor-sign-in) on then gets an "Authentication code" field. It takes a 6-digit code from an authenticator app or a backup code.
- In sign-in and sign-up mode, `<AuthForm>` shows the [social sign-in buttons](#adding-the-buttons) under the form.
- `<AuthForm>` is registered only when Nuxt UI is on.

The form validates with `signInSchema`, `signUpSchema`, `forgotPasswordSchema` or `resetPasswordSchema`. nuxvel ships the schemas and auto-imports them in the app:

```ts
export const signUpSchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  password: z.string().min(12),
});

export const signInSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const forgotPasswordSchema = z.object({
  email: z.email(),
});

export const resetPasswordSchema = z.object({
  password: z.string().min(12),
});
```

The starter's `app/pages/verify-email.vue` tells a new user to open the link in the mail. Its button sends the link again with `authClient.sendVerificationEmail()`.

To build a form of your own, give `authClient` to `useActionForm()` as the mutation:

```ts
const form = useActionForm(
  signInSchema,
  {
    mutation: async (input) => {
      const { data, error } = await authClient.signIn.email(input);

      if (error) throw new Error(error.message ?? "Could not sign in");

      return data;
    },
  },
  {
    defaults: { email: "", password: "" },
    onSuccess: () => navigateTo({ name: "index" }),
  },
);
```

Set `nuxvel.auth.signInPath` to the sign-in page, so that the `auth` middleware sends signed-out visitors there. See [Protecting pages](#protecting-pages).

## Email verification

```ts
const { error } = await authClient.signIn.email({ email, password });

if (error?.code === "EMAIL_NOT_VERIFIED") {
  await authClient.sendVerificationEmail({ email, callbackURL: "/" });
}
```

In a production build, a user must confirm their email address before they can sign in with a password. Sign-up creates the user, starts no session, and sends the `nuxvel.auth.verify-email` mail. The mail does not print the name from the sign-up. The person who asks for it chooses that name, and the address is not confirmed yet. A password sign-in before the confirmation answers HTTP 403 with the code `EMAIL_NOT_VERIFIED`.

The mail holds a link to `/api/auth/verify-email`. The link sets `emailVerified` on the user, signs the user in, and sends the browser to the `callbackURL` of the sign-up. If the user has [two-factor sign-in](#two-factor-sign-in) on, the link starts no session. It sends the browser to `nuxvel.auth.signInPath` with `?twoFactor=true` instead. The link expires after 24 hours. A user asks for a new link with `authClient.sendVerificationEmail()`, at most 3 times an hour.

| Build | Verification |
|---|---|
| production | required |
| development (`nuxi dev`) | off |
| test | off |

Set `NUXT_AUTH_REQUIRE_EMAIL_VERIFICATION` to `true` or `false` to change this for one server. The mail needs `nuxvel.mail.from` and `NUXT_MAIL_URL`. See [Mail](./mail.md#configuration).

## Password reset

```ts
await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
```

```ts
// app/pages/reset-password.vue
const token = String(useRoute().query.token ?? "");

await authClient.resetPassword({ token, newPassword });
```

`requestPasswordReset()` sends the `nuxvel.auth.reset-password` mail. The mail holds a link to `/api/auth/reset-password/<token>`, which sends the browser to `redirectTo` with the token in the `token` query parameter. The token works once and expires after 1 hour. When the token is not valid, the query has `error=INVALID_TOKEN` in place of the token.

`resetPassword()` sets the new password. It also signs out every session of the user, deletes every [API key](./openapi.md#api-keys) of the user and sends the `nuxvel.auth.security-notice` mail to confirm the change.

## Password rules

A new password needs at least 12 characters. There are no other composition rules. Sign-up, password change and password reset refuse a shorter one with HTTP 400 `PASSWORD_TOO_SHORT`. `signUpSchema` checks the same length in the form.

The same endpoints also refuse a password that is in a known data breach, with HTTP 400 `PASSWORD_COMPROMISED`. Better Auth's [Have I Been Pwned plugin](https://www.better-auth.com/docs/plugins/have-i-been-pwned) does the check. It sends only the first 5 characters of the password's SHA-1 hash to `api.pwnedpasswords.com`. When the service cannot be reached, the endpoint answers HTTP 500 and sets no password. The check has no time limit of its own, because the Better Auth plugin takes no timeout option. A service that accepts the connection and does not answer keeps the request open until Node's `fetch` stops waiting, after 5 minutes. The request holds no database connection while it waits.

| Build | Breach check |
|---|---|
| production | on |
| development (`nuxi dev`) | on |
| test | off |

Set `NUXT_AUTH_CHECK_BREACHED_PASSWORDS` to `true` or `false` to change this for one server. To test the check, turn it on and answer the range request with [`fakeFetch()`](./testing.md#faking-outbound-requests):

```ts
import { createHash } from "node:crypto";

const hash = createHash("sha1").update("password1234").digest("hex").toUpperCase();

await fakeFetch({
  [`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`]: { body: `${hash.slice(5)}:52256179` },
});
```

## Disposable email addresses

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  nuxvel: { auth: { blockDisposableEmails: true } },
});
```

With `blockDisposableEmails`, sign-up and email change refuse an address at a disposable email service, such as `mailinator.com`, with HTTP 400 `DISPOSABLE_EMAIL`. The list of domains comes from the [`disposable-email-domains-js`](https://www.npmjs.com/package/disposable-email-domains-js) package, which updates it often. The option is off by default.

## The user image

Sign-up and `/api/auth/update-user` refuse a request that sets `image`, with HTTP 400 `IMAGE_NOT_ACCEPTED`. `image: null` is accepted and removes the image. Only server code and a social provider set `user.image`. A social provider sets it to the `https` URL of the user's picture at that provider. To let users upload a picture, promote the upload in an action and write the key to `user.image` there. See [Storage](./storage.md#showing-a-stored-file).

## The user name

Sign-up, `/api/auth/update-user` and a social sign-in refuse a `name` with more than 200 characters, with HTTP 400 `NAME_TOO_LONG`. The password-reset and security-notice mails print at most 200 characters of the name and of the device. The verification and existing-account mails do not print the name.

## Account enumeration

The auth endpoints do not tell a visitor which email addresses have an account:

| Endpoint | Registered email | Unknown email |
|---|---|---|
| sign-in with a wrong password | HTTP 401 `INVALID_EMAIL_OR_PASSWORD` | the same |
| password reset request | HTTP 200, a reset mail | HTTP 200, no mail |
| sign-up, while [email verification](#email-verification) is on | HTTP 200 with a user and no session, the `nuxvel.auth.existing-account` mail to the owner | HTTP 200 with a user and no session, a verification mail |

The verification, reset, existing-account and email-change mails go out after the response. Thus the response takes the same time for a registered email and for an unknown email. If a mail fails, the request does not fail. nuxvel logs the error with the tag `auth` and reports it to the error tracker. An address gets at most one `nuxvel.auth.existing-account` mail an hour. A sign-up after that answers the same, without a mail.

The existing user and their password do not change. While email verification is off, a sign-up with a registered email answers HTTP 422 `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`, because a new sign-up then starts a session.

## Social login

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  nuxvel: {
    auth: {
      signInPath: "/sign-in",
      social: { github: true, google: true },
    },
  },
});
```

`nuxvel.auth.social` turns on sign-in with a social provider. Each key is a Better Auth provider name. You can use every provider that Better Auth ships, except `cognito` and `tiktok`. These two need more settings than a client ID and a client secret.

### Registering the OAuth app

Register an OAuth app with each provider. Give the provider this callback URL, with your app's address and the provider name:

```
https://app.example.com/api/auth/callback/github
```

For local development, register a second OAuth app with the dev server's address, for example `http://localhost:3000/api/auth/callback/github`.

Then put the app's credentials in `.env`:

```sh
NUXT_AUTH_GITHUB_CLIENT_ID=Iv1.0123456789abcdef
NUXT_AUTH_GITHUB_CLIENT_SECRET=0123456789abcdef0123456789abcdef01234567
```

| Variable | Value |
|---|---|
| `NUXT_AUTH_<PROVIDER>_CLIENT_ID` | client ID of the provider's OAuth app |
| `NUXT_AUTH_<PROVIDER>_CLIENT_SECRET` | client secret of the provider's OAuth app |

`<PROVIDER>` is the provider name in capital letters, for example `GOOGLE`. In production, the server does not start while a provider in `nuxvel.auth.social` has no client ID or no client secret. In development, the server starts, and a sign-in with that provider fails. A test build also starts without them, because `runtimeConfig.auth.requireSocialCredentials` is off there. Its variable is `NUXT_AUTH_REQUIRE_SOCIAL_CREDENTIALS`. A production build has it on. `nuxvel doctor` names each missing variable in both cases.

Better Auth builds the callback URL, and the links in its mails (verify, reset and change email), from `NUXT_SITE_URL` (`runtimeConfig.siteUrl`), for example `https://app.example.com`. It also trusts that origin for `callbackURL` and `redirectTo`. A sign-up or sign-in request from a browser on another origin gets `403 INVALID_ORIGIN`, so set the origin that the browser opens, with its port. It does not use the `Host` header of the request, because a client can send any `Host` header, and a forged one would send a reset link to another host. In production, the server does not start without the variable. In development and in tests, an empty value uses the origin of the request. `nuxvel app:create` sets it on a VPS. See [Env validation at boot](./security.md#env-validation-at-boot).

### Adding the buttons

```vue
<SocialSignIn class="mt-4" />
```

`<SocialSignIn>` shows one "Continue with …" button for each provider in `nuxvel.auth.social`. A click sends the browser to the provider. The provider sends the user back to `/`, signed in. A user with [two-factor sign-in](#two-factor-sign-in) on comes back to the sign-in page, which asks for the code first. When no provider is on, the component renders nothing.

`<AuthForm>` already shows `<SocialSignIn>` under the form. Add it yourself only to a form of your own. The component is auto-registered unless you set `nuxvel.ui: false`.

### Signing in from code

```ts
const { signInWith } = useUser();

const { error } = await signInWith("github", { callbackURL: "/dashboard" });
```

`signInWith()` comes from `useUser()`. It accepts only the providers in `nuxvel.auth.social`. Any other name is a type error. `callbackURL` is the page that the user comes back to, `/` by default. When the sign-in starts, the browser leaves the page for the provider. When it cannot start, for example after too many attempts, `error` tells why.

### New and existing users

On the first sign-in with a provider, Better Auth creates a `user` row. The `account` table keeps the link to the provider.

A user who signed up with email and password can sign in with a provider that has the same email address only after they confirm that address. Better Auth links a provider only to a verified email address. See [Email verification](#email-verification).

When the sign-in fails at the callback, Better Auth sends the user to its error page, `/api/auth/error`. The `error` query parameter holds the reason, for example `account_not_linked`.

<a id="client-current-user"></a>

## Reading the current user

```vue
<script setup lang="ts">
const { user, isPending, signOut } = useUser();
</script>

<template>
  <USkeleton v-if="isPending" class="h-4 w-40" />
  <p v-else-if="user">
    Hi, {{ user.email }}
    <UButton label="Sign out" @click="signOut().then(() => navigateTo({ name: 'index' }))" />
  </p>
  <p v-else>Signed out</p>
</template>
```

`useUser()` is auto-imported. `user` is `null` when the visitor is signed out, and also while the session loads. Use `isPending` to tell the two states apart.

`useUser()` and the `auth` and `guest` middleware share one session:

- The server loads it once per render, so the page arrives with the signed-in markup already in it.
- The session goes to the browser with the page. Hydration and navigation load nothing more.
- On a [`cached` page](./rendering.md#cached-pages-and-the-signed-in-user), the shared copy has no session. The browser loads the session after hydration, and `user` then changes from `null` to the signed-in user.
- A sign-up, sign-in or sign-out through `authClient` starts a refresh of the session before the call resolves. The middleware waits for that refresh, so a `navigateTo()` right after the call sees the new state.

`signOut()` ends the session, clears `user` and removes every cached query. A query that a mounted component still uses loses its data and goes back to `pending`. With `nuxvel.pwa` set, it also deletes the service worker's page cache and ends the push subscription of the device (see [PWA](./pwa.md#offline)). No data from the previous user stays in the page. The server also closes the [realtime streams](./realtime.md#authorizing-a-connection) of the session. `signOut()` does not navigate, so choose the next page yourself. The starter's `app` layout does this from its user menu. See [Frontend](./frontend.md#layouts).

## Bot protection

```sh
NUXT_AUTH_TURNSTILE_SECRET_KEY=0x4AAAAAAA...
```

Set `NUXT_AUTH_TURNSTILE_SECRET_KEY` to the secret key of a [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/) widget. Then sign-up and password reset requests need a Turnstile token in the `x-captcha-response` header. Better Auth's captcha plugin checks the token with Turnstile. A request without a token answers HTTP 400. A token that Turnstile refuses answers HTTP 403. Without the key, there is no check.

Render the Turnstile widget on the sign-up and password reset forms yourself, and send its token with the call:

```ts
await authClient.signUp.email(input, { headers: { "x-captcha-response": token } });
```

`<AuthForm>` does not render the widget. The widget loads a script and an iframe from `challenges.cloudflare.com`, so add that origin to `script-src` and `frame-src` in the `security.headers.contentSecurityPolicy` of `nuxt.config.ts`.

In production, [`nuxvel doctor`](./cli.md#nuxvel-doctor) warns while sign-up is open without the key. To test the check, set the key for the test server and fake the Turnstile answer with [`fakeFetch()`](./testing.md#faking-outbound-requests):

```ts
await fakeFetch({
  "https://challenges.cloudflare.com/turnstile/v0/siteverify": { body: { success: false } },
});
```

## Managing sessions

```ts
const { data: sessions } = await authClient.listSessions();

await authClient.revokeSession({ token: sessions?.[1]?.token ?? "" });
```

`authClient.listSessions()` returns every session of the signed-in user. Each session has the device's `userAgent`, its `ipAddress`, and `updatedAt`, the time of its last activity. `authClient.revokeSession({ token })` ends one session, and that device is signed out on its next request and gets no more [push notifications](./pwa.md#push-notifications). `authClient.revokeOtherSessions()` ends every session except the current one.

A password change with `authClient.changePassword()` ends every other session of the user. Those devices are signed out and get no more push notifications. The current session stays signed in, with its two-factor state.

A session lasts 7 days. Better Auth extends it once a day while the user is active.

## Changing the email address

```ts
await authClient.changeEmail({ newEmail: "ada@new.example.com", callbackURL: "/settings" });
```

`changeEmail()` needs a sign-in in the last 10 minutes, the same rule as [`freshProcedure`](#recent-sign-in-procedures). An older session gets `FORBIDDEN` with the code `SESSION_NOT_FRESH`. Ask the user to sign in again. `changeEmail()` does not change the address at once. When the current address is verified, it sends the `nuxvel.auth.security-notice` mail with an approval link to the current address. When the user opens that link, nuxvel sends the `nuxvel.auth.verify-email` mail with a confirmation link to the new address. The address changes when the user opens the second link. A stolen session alone therefore cannot move the account to another address. When the current address is not verified, the first step does not occur: the confirmation link goes straight to the new address, and the current address gets the `nuxvel.auth.security-notice` mail with no link. Each link expires after 24 hours, and the last link sends the browser to `callbackURL`.

## Two-factor sign-in

```ts
const { data } = await authClient.twoFactor.enable({ password });
// show data.totpURI as a QR code or a key, and keep data.backupCodes

await authClient.twoFactor.verifyTotp({ code });
```

Every user can turn on two-factor sign-in with Better Auth's [two-factor plugin](https://www.better-auth.com/docs/plugins/2fa). `twoFactor.enable()` checks the password and returns a TOTP URI for an authenticator app and 10 backup codes. The first `verifyTotp()` with a code from the app turns two-factor sign-in on. `nuxvel.seo.siteName` is the issuer name that the app shows.

When two-factor sign-in is on, a correct password starts no session. `signIn.email()` answers `{ twoFactorRedirect: true }` instead. Then `authClient.twoFactor.verifyTotp({ code })` or `authClient.twoFactor.verifyBackupCode({ code })` starts the session. A wrong code answers HTTP 401. Each backup code works once. `<AuthForm>` asks for the code itself.

A social sign-in or an email verification link of a user with two-factor sign-in on also starts no session. The provider or the link sends the browser to `nuxvel.auth.signInPath` with `?twoFactor=true`, and a two-factor cookie that expires after 10 minutes. `<AuthForm mode="sign-in">` then shows the code field at once. On a form of your own, read `twoFactor` from the query and call `verifyTotp({ code })` or `verifyBackupCode({ code })`.

In a test, `totpCode(totpURI)` from `@nuxvel/nuxt/testing` returns the current code of the `totpURI` that `twoFactor.enable()` answers. It follows the test clock. See [Testing](./testing.md).

`authClient.twoFactor.disable({ password })` turns it off. The session user has a `twoFactorEnabled` field.

## Security notices

nuxvel mails a user the `nuxvel.auth.security-notice` mail when their account changes. The `change` field of the mail input names the change:

| `change` | Sent when |
|---|---|
| `new-sign-in` | the user signs in from a browser that has not signed in to this account before |
| `password` | the password changes, with `changePassword()` or a reset |
| `email` | the user asks to change the email address, to the current address. For a verified address, the mail has the link that approves the change |
| `two-factor-on` | two-factor sign-in turns on |
| `two-factor-off` | two-factor sign-in turns off |

A browser counts as known when it holds the signed `known_device` cookie for the user. A sign-up or an email confirmation sets the cookie and sends no notice. The `new-sign-in` notice shows the browser's user agent.

## Protecting pages

```ts
// app/pages/dashboard.vue
definePageMeta({
  middleware: "auth",
});
```

```ts
// app/pages/sign-in.vue
definePageMeta({
  middleware: "guest",
});
```

nuxvel registers two named route middleware. Each one runs only on the pages that list it:

| Middleware | Effect |
|---|---|
| `auth` | sends a signed-out visitor to the sign-in path |
| `guest` | sends a signed-in visitor to `/` |

The `guest` middleware always sends the visitor to `/`. It does not use `signInPath`, and no option changes the target.

Each middleware keeps the locale of the page. On `/zh/profile`, the `auth` middleware sends a signed-out visitor to `/zh/sign-in`. On `/zh/sign-in`, the `guest` middleware sends a signed-in visitor to `/zh`.

The sign-in path is `/` by default. Set it to your sign-in page in `nuxt.config.ts`:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  nuxvel: { auth: { signInPath: "/sign-in" } },
});
```

## Reading the session on the server

```ts
// server/api/me.get.ts
export default defineEventHandler(async () => {
  const session = await auth();

  return session?.user ?? null;
});
```

```ts
// server/api/drafts.get.ts
import { eq } from "drizzle-orm";
import { postTable } from "#nuxvel/schema";

export default defineEventHandler(async () => {
  const { user } = await requireAuth();

  return useDb().select().from(postTable).where(eq(postTable.authorId, user.id));
});
```

Both helpers are auto-imported on the server:

| Helper | Returns |
|---|---|
| `auth()` | the session, or `null` when signed out |
| `requireAuth()` | the session, or throws `UnauthenticatedError` |

`UnauthenticatedError` answers with HTTP 401 (tRPC `UNAUTHORIZED`). This is the same from a procedure and from a plain route handler.

Both helpers read the request headers from the async context, so you do not pass `event`. Use them in server routes, in middleware and anywhere else on the server.

nuxvel looks up the session once per request. Later calls in the same request reuse that lookup. This includes several `authedProcedure` calls in one batched tRPC request.

### The caller anywhere on the server

`useAuth()` returns `{ user, actor }` for the code that runs now. You do not pass `ctx` or `event`. It works in a procedure, an action, a seeder and a plain route handler, and in all code that they call.

```ts
// server/utils/stamp.ts
export async function stamp() {
  const { user, actor } = await useAuth();

  return { by: user?.email ?? null, actorType: actor?.type ?? null };
}
```

- `actor` is the actor of the running action or procedure. Outside those, it is the caller of the request: an API key, then the session. It is `null` when nobody is signed in.
- `user` is the user behind that actor. nuxvel reads it from the session, or loads it from the `user` table. It is `null` for a `systemActor` and when nobody is signed in.
- A job sees the actor that dispatched it, and that actor's user. It sees `null` when nobody dispatched it. See [The dispatcher](./queues.md#the-dispatcher).

### Coming from Better Auth

The Better Auth docs name the server instance `auth` and call `auth.api.getSession({ headers })`. In nuxvel, `auth` is a function. `auth()` reads the session of the current request, and `requireAuth()` does the same but throws when signed out. The Better Auth instance is internal to nuxvel, so an app does not import it or call `auth.api`.

## User roles

```ts
const session = await requireAuth();

if (session.user.role !== "admin") throw new ForbiddenError("Admins only");
```

`session.user` carries the `role` column of the `user` table. Its default value is `"user"`. Sign-up cannot set the role. To promote a user, update their row.

In a page, `useUser()` gives the same `role`:

```vue
<script setup lang="ts">
const { user } = useUser();
</script>

<template>
  <UButton v-if="user?.role === 'admin'" :to="{ name: 'admin' }" label="Admin" />
</template>
```

A check in a page only hides a control. The server must enforce the same rule in the procedure or in a policy.

Policies, channels, flags and the queue dashboard all read the role from the session.

## The locale of the user

The `user` table has a `locale` column. Sign-up sets it to the locale of the request, from [`currentLocale()`](./i18n.md#the-locale-on-the-server). `authClient` sends the locale of the current page with each call. Thus a user who signs up on `/zh/sign-up` gets `zh`. A social sign-in also sets it.

The user changes the locale with `authClient.updateUser()`. The server accepts only a locale code from `i18n.locales`:

```ts
await authClient.updateUser({ locale: "zh" });
```

The auth mails go out in the locale of the user: verify email, reset password, security notice and existing account. A [notification](./notifications.md#the-mail-channel) mail also uses the locale of the user. When the column is empty, for example for a user from before the column, the mail uses `currentLocale()`. `useUser()` and `session.user` have the `locale` field.

The links in the auth mails also go to the pages of that locale. For a user with `zh`, the reset link opens `/zh/reset-password`, and the verify link opens `/zh`. nuxvel changes the path of the `callbackURL` (or `redirectTo`) that the client sends: it removes a locale prefix and adds the prefix of the user's locale. A full URL stays the same.

## Protecting tRPC procedures

```ts
// server/trpc/routers/post.router.ts
import { eq } from "drizzle-orm";
import { z } from "zod";
import { postTable } from "#nuxvel/schema";

export const postRouter = {
  mine: authedProcedure.output(z.array(postSchema)).query(({ ctx }) =>
    useDb().select().from(postTable).where(eq(postTable.authorId, ctx.user.id)),
  ),
  delete: authedProcedure
    .output(postIdInput)
    .action($actions.posts.deletePost),
};
```

Use `authedProcedure` in place of `publicProcedure` when a procedure needs a signed-in user. A signed-out call gets `UNAUTHORIZED`. `authedProcedure` adds two values to `ctx`:

| Value | Contents |
|---|---|
| `ctx.user` | the session user, `role` included |
| `ctx.actor` | the same user as an actor, for [actions](./actions.md) and [policies](./authorization.md) |

A `publicProcedure` also has `ctx.user` and `ctx.actor`. Each is `null` when the call is signed out. Use them when a public procedure shows more to a signed-in visitor.

A machine client calls an `authedProcedure` with an API key in place of a session. `ctx.user` is then the key's owner, and `ctx.actor` is the key. See [API keys](./openapi.md#api-keys).

### Role procedures

```ts
// server/trpc/routers/ticket.router.ts
const agentProcedure = roleProcedure(["admin", "agent"]);

export const ticketRouter = {
  list: agentProcedure.query(() => useDb().select().from(ticketTable)),
};
```

`roleProcedure(roles)` returns an `authedProcedure` that also needs one of `roles`. A signed-out call gets `UNAUTHORIZED`. A signed-in user with another [role](#user-roles) gets `FORBIDDEN`. The check runs before `.input()`, so [`expectRefused()`](./testing.md#refusing-a-whole-router) can test the whole router.

A call with an API key also gets `FORBIDDEN`. The key of a user has the role of that user, so a leaked key would otherwise open each procedure of its owner. To accept keys, pass `{ apiKeys: true }`:

```ts
const integrationProcedure = roleProcedure(["admin"], { apiKeys: true });
```

For admin tools, use `adminProcedure`. It also needs a two-factor sign-in.

### Admin procedures

```ts
// server/trpc/routers/account.router.ts
import { desc } from "drizzle-orm";
import { z } from "zod";
import { userTable } from "#nuxvel/schema";

export const accountRouter = {
  signUps: adminProcedure
    .output(z.array(z.object({ id: z.string(), email: z.string(), createdAt: z.date() })))
    .query(() =>
      useDb()
        .select({ id: userTable.id, email: userTable.email, createdAt: userTable.createdAt })
        .from(userTable)
        .orderBy(desc(userTable.createdAt))
        .limit(50),
    ),
};
```

`adminProcedure` is an `authedProcedure` that also needs the `admin` [role](#user-roles) and a session that passed [two-factor sign-in](#two-factor-sign-in). A signed-out call gets `UNAUTHORIZED`. A signed-in user with another role gets `FORBIDDEN`. An admin also gets `FORBIDDEN` when the session has no second factor. Only a session that starts from a valid TOTP or backup code has one. That is the second step of a sign-in, or the first `verifyTotp()` that turns two-factor sign-in on. A social sign-in without that second step and a session from before two-factor sign-in was on do not have one. To use admin tools, the admin then signs out and signs in again with the password and a code. An admin with only a social account cannot do this. A call with an API key also gets `FORBIDDEN`. `ctx.user` and `ctx.actor` are the same as in `authedProcedure`.

The session table has a `two_factor_verified` column for this check, and the session has a `twoFactorVerified` field. In tests, the session of [`actingAs()`](./testing.md#acting-as-a-user) counts as verified when the user has `twoFactorEnabled`. Pass `{ twoFactorVerified: false }` to test the refusal.

### Recent sign-in procedures

```ts
// server/trpc/routers/account.router.ts

export const accountRouter = {
  changeEmail: freshProcedure
    .output(z.object({ email: z.email() }))
    .action($actions.account.changeEmail),
};
```

`freshProcedure` is an `authedProcedure` that also needs a sign-in in the last 10 minutes. Use it for a sensitive change, such as a new email, a new password or deleting the account. When the session is older than 10 minutes, the call gets `FORBIDDEN` with the message "Sign in again to continue". Ask the user to sign in again, then retry. A call with an API key always gets `FORBIDDEN`.

The age comes from the session's `createdAt` and [`now()`](./testing.md#controlling-time), so `travelBy()` moves it in a test. An `actingAs()` caller counts as a fresh sign-in.

## Rate limiting

Every `/api/auth/*` endpoint except `get-session` goes through the Better Auth rate limiter. nuxvel counts the attempts in Redis, per client IP and endpoint. All instances of the app share one count.

| Endpoints | Limit |
|---|---|
| sign-in, social sign-in included | the `login` limit: 5 per minute, unless you change it |
| sign-up | the numbers of the `login` limit, counted separately from sign-in |
| verification emails | 3 per hour |
| password reset emails | 3 per 60 seconds |
| change password, change email | 3 per 10 seconds |
| all other endpoints | 100 per 10 seconds |

Sign-ins spend the budget of the `login` limit, keyed `ip:<client IP>`. These calls count against the same attempts as a sign-in from that IP:

```ts
await rateLimiter("login").consume(`ip:${ip}`);
```

```ts
rateLimit({ limit: "login", by: "ip" });
```

Each attempt shows in DevTools.

A request over the limit gets HTTP 429, which is different from the answer to a wrong password. The response has an `X-Retry-After` header with the number of seconds to wait.

To change the numbers of the `login` limit, add `server/rate-limits/login.rate-limit.ts`:

```ts
// server/rate-limits/login.rate-limit.ts
export const loginRateLimit = defineRateLimit({ points: 10, window: { minutes: 5 } });
```

See [Security](./security.md#shared-limits).

### Delays after failed sign-ins

After 5 failed password sign-ins on one email address, each next sign-in for that address waits before it answers: 1 second, then 2, 4, 8 and 16 seconds, and at most 30 seconds. The delay applies to every client, whatever its IP. There is no lockout. The correct password still signs the user in after the delay.

A successful sign-in clears the count. So do 15 minutes without a failed sign-in. The count lives in Redis, next to the rate-limit counts.

When Redis is down, session reads continue to work, so signed-in pages still render as signed in. Every limited endpoint, sign-in and sign-up included, answers HTTP 503 (`SERVICE_UNAVAILABLE`) until Redis is back. The endpoints do not run without a limit.

## Rotating the auth secret

```sh
nuxvel key:rotate NUXT_AUTH_SECRET
```

`NUXT_AUTH_SECRET` signs sessions. The command writes the new secret to `.env` and keeps the previous one for a grace period. After the server restarts with the new value, the new secret signs new sessions. Sessions that the previous secret signed continue to verify until `NUXT_AUTH_SECRET_PREVIOUS_EXPIRES_AT` passes. Two-factor sign-in continues to work too. `NUXT_AUTH_SECRET` encrypts the TOTP secret and the backup codes of each user. During the grace period, nuxvel decrypts them with the new or the previous secret. The built-in schedule `nuxvel.auth.reencrypt-two-factor` runs every day at 04:15 in `nuxvel queue:work` and encrypts them again with the new secret. To do this now, run `nuxvel schedule:run nuxvel.auth.reencrypt-two-factor` after the server restarts. Make sure the schedule ran before the grace period ends and before the next rotation. If it did not, users who turned on two-factor sign-in before the rotation cannot sign in.

See [CLI](./cli.md#nuxvel-keyrotate-name) and [Security](./security.md#rotating-secrets).

## Testing

```ts
import { actingAs, expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { userFactory } from "#nuxvel/factories";

describe("posts", () => {
  it("lets a signed-in user create a post", async () => {
    const { trpc } = actingAs(await userFactory());

    const post = await trpc.post.create({ title: "Hello", body: "" });

    expect(post.title).toBe("Hello");
  });

  it("refuses a guest", async () => {
    await expect(guest().trpc.post.create({ title: "Hello", body: "" }))
      .rejects.toBeTrpcError("UNAUTHORIZED");
  });
});
```

`actingAs(user)` runs each call as that user, and `guest()` with no session. See [Testing: acting as a user](./testing.md#acting-as-a-user).

## See also

- [Authorization](./authorization.md)
- [Security](./security.md)
- [API (tRPC)](./api.md)
- [Frontend](./frontend.md)
