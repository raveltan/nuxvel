# Rendering

## Introduction

By default, the server renders each page on each request. A rendering preset changes this for a route: cache the page, keep it private, or render it only in the browser. nuxvel also gives you `<DateTime>`, which renders a date with the same text on the server and in the browser.

## Rendering presets

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["@nuxvel/nuxt"],
  nuxvel: {
    rendering: {
      "/blog/**": "cached",
      "/dashboard/**": "private",
      "/editor": "client",
    },
  },
});
```

Set a preset for each route pattern under `nuxvel.rendering`. The patterns are the same as the patterns of Nuxt `routeRules`.

| Preset | Where it renders | Cache |
|---|---|---|
| _(none)_ | On the server, on each request. | No. |
| `cached` | On the server once. Later requests get the cached copy. After 60 seconds, the server renders the page again in the background. | Yes, one copy for all visitors. The response has `Cache-Control: s-maxage=60, stale-while-revalidate`. |
| `private` | On the server, on each request. The response has `Cache-Control: private, no-store` and `X-Robots-Tag: noindex`. | Never. |
| `client` | Only in the browser. The server sends an empty shell. | No. |

A `client` page keeps the theme colours of Nuxt UI under the [strict CSP](./security.md#security-headers). The CSP allows the colour style by its hash.

With [`nuxvel.seo`](./seo.md#robots-and-sitemap) set, the `X-Robots-Tag` header of a `private` page is `noindex, nofollow`, and the page is not in the sitemap.

The `cached` preset is stale-while-revalidate. On Node, ISR is the same thing.

A `cached` page is one copy for all visitors. Use it only for a page that looks the same to every visitor. A page that shows data of the signed-in user is `private`.

### Presets and `routeRules`

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  nuxvel: {
    rendering: { "/blog/**": "cached" },
  },
  routeRules: {
    "/blog/**": { cache: { maxAge: 300 } },
  },
});
```

Each preset becomes a `routeRules` entry. If you also write a `routeRules` entry for the same pattern, the keys in your entry win. The preset fills in the keys that your entry does not set. In the example, blog pages stay in the cache for 300 seconds, and still revalidate in the background.

## Signed-in pages

```vue
<!-- app/pages/(app)/dashboard.vue -->
<template>
  <h1>Dashboard</h1>
</template>
```

A page in the `(app)` [route group](./frontend.md#route-groups) has the `auth` middleware. A page with the `auth` middleware is never cached. The same applies to a page nested under such a page. This includes a page with an optional param (`[[tab]].vue`), a catch-all page (`[...path].vue`) and each `alias` of the page. For an optional or catch-all param, nuxvel turns off the cache for all the paths under the part of the path before that param. This is true even if a preset or a `routeRules` entry caches the route. nuxvel renders the page with the `private` preset and turns off the cache, ISR and prerender for it. At build time, it shows a warning:

```
[nuxvel] /dashboard uses the auth middleware but its route rules cache it; rendering it with the private preset instead.
```

To remove the warning, remove the caching rule for that route.

Each page that the server renders for a signed-in visitor (a request with the session cookie) has `Cache-Control: private, no-store`. This is true with or without the `auth` middleware. A `cached` page is the exception: all visitors get the shared copy.

## Cached pages and the signed-in user

The server renders the shared copy of a `cached` page without the session cookie. The copy thus shows the guest view, and it never contains data of a user. After hydration, the browser loads the session of the visitor, and `useUser()` changes to the signed-in user. A signed-in user can thus see the guest view change to their own view, for example "Sign in" change to their user menu. The same applies to a route with `isr`, `swr`, `prerender` or `payload` in its route rules. See [Auth](./auth.md#reading-the-current-user).

## Cached pages and flags

On a `cached` page, `useFlag()` and `useExperiment()` render the value of a guest into the shared copy. When the page starts in the browser, it loads the values for the visitor and shows them. Then it records the exposures.

A signed-in user can thus see the guest value change to their own value. Do not put flag content that must not flicker on a `cached` page. See [Feature flags](./flags.md#cached-pages).

## Cached pages and cookies

The shared copy of a `cached` page never sets a cookie. nuxvel removes each `Set-Cookie` header from the render that goes into the cache, so a CDN can keep the copy, and one visitor never gets the cookie of another visitor. For example, a cached `/zh` page does not set the `user-locale` cookie. A page that is not cached sets it. See [Internationalization: cached pages](./i18n.md#cached-pages).

## Errors on cached pages

A response with a status of 400 or higher has `Cache-Control: no-store`, also on a `cached` route. A page that answers `404` for a missing record is thus not kept by a CDN or by the Nitro cache. The next request renders the page again.

## Cached pages and maintenance mode

In [maintenance mode](./maintenance.md), a `cached` route answers `503` with `Cache-Control: no-store`. The maintenance check answers before the cache, so the cache never serves or stores the maintenance page. After `nuxvel up`, the next request gets the cached page again.

## Payload size

```
The payload of /posts is 142 KB, over 100 KB. Largest queries:
  ["trpc","post","list",{"page":1}] 120 KB
  ["trpc","tag","list"] 12 KB
```

A server-rendered page sends the results of its queries to the browser in the page payload. A large payload makes the page slow to load and to hydrate. In development, nuxvel logs a warning when the payload of a page passes 100 KB. The warning lists the three largest queries by their cache key. Select fewer columns, or load one page of rows with [`paginate()`](./database.md#pagination).

## Prerendering at build time

A route with `prerender: true` renders while `nuxt build` runs. The prerender process does not run the boot check of the environment, so the build needs no `NUXT_SITE_URL`, `NUXT_AUDIT_CHAIN_SECRET`, `NUXT_OG_IMAGE_SECRET` or social login credentials. The production server still checks them when it starts, and it refuses to start without them. A CLI command such as `nuxvel db:seed` builds the server of the app without the prerender step, so a `prerender: true` route does not slow it down or break it.

## Dates

```vue
<template>
  <DateTime :value="post.createdAt" />
  <DateTime :value="post.createdAt" :options="{ dateStyle: 'long' }" locale="en-GB" />
</template>
```

A date that you format with `toLocaleString()` uses the timezone of the server in the HTML. After hydration, it uses the timezone of the browser. The two texts are different, which causes a hydration mismatch. Render dates with `<DateTime>` to prevent this. The component is registered automatically.

The first example renders this HTML:

```html
<time datetime="2026-01-15T23:30:00.000Z">Jan 15, 2026, 11:30 PM</time>
```

| Prop | Default |
|---|---|
| `value` | Required. A `Date`, an ISO string or epoch milliseconds. |
| `locale` | The `iso` of the current [i18n locale](./i18n.md#nuxt-ui-and-dates), for example `zh-CN` on a `/zh` page. The server and the browser use the same locale. |
| `options` | `{ dateStyle: "medium", timeStyle: "short" }`. `Intl.DateTimeFormat` options. `<DateTime>` ignores `timeZone`. |
| `relative` | `false`. Shows the distance from now, such as `5 minutes ago`, instead of the date. |

### Relative dates

```vue
<DateTime :value="comment.createdAt" relative />
```

```html
<time datetime="2026-01-15T23:25:00.000Z">5 minutes ago</time>
```

With `relative`, `<DateTime>` measures from the time of the server render. Hydration uses the same time, so the texts match. When the component mounts, it measures from the clock of the browser. It does not update itself as time passes.

### The timezone

```vue
<script setup lang="ts">
const timezone = useTimezone();
</script>

<template>
  <p>Times are shown in {{ timezone }}.</p>
</template>
```

`<DateTime>` formats in the timezone that `useTimezone()` returns. `useTimezone()` is auto-imported and returns a read-only ref of an IANA timezone name.

1. On the first visit, the timezone is `UTC`, on the server and during hydration.
2. After hydration, the browser changes the ref to its own timezone. Each `<DateTime>` on the page renders again.
3. The browser stores its timezone in the `nuxvel-timezone` cookie, for one year.
4. On the next request, the server reads the cookie and renders in the timezone of the visitor. Nothing changes after hydration.

A cookie value that is not a valid timezone counts as `UTC`.

## Testing

```ts
import { describe, expect, guest, it } from "@nuxvel/nuxt/testing";

describe("blog pages", () => {
  it("are cached", async () => {
    const response = await guest().fetch("/blog/first-post");

    expect(response.headers.get("cache-control")).toBe("s-maxage=60, stale-while-revalidate");
  });
});
```

Read the headers of the response to test a preset. See [Testing](./testing.md).

## See also

- [Feature flags](./flags.md)
- [SEO](./seo.md)
- [Auth](./auth.md)
- [Testing](./testing.md)
