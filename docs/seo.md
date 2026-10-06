# SEO

## Introduction

Search engines and social sites read the `<head>` of a page, `robots.txt` and `sitemap.xml`. Set `nuxvel.seo` to give every page a title template, a canonical link and default Open Graph and Twitter tags. The same option serves `robots.txt` and `sitemap.xml`. SEO is useful only on pages that the server renders, so it has no effect on a page with the `client` preset.

## Site defaults

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["@nuxvel/nuxt"],
  nuxvel: {
    seo: {
      siteName: "The Blog",
      siteUrl: "https://blog.example.com",
      defaultDescription: "Notes on building web apps.",
      defaultImage: "/og.png",
      twitter: "@theblog",
    },
  },
});
```

With `nuxvel.seo` set, nuxvel installs [`@nuxtjs/robots`](https://nuxtseo.com/robots) and [`@nuxtjs/sitemap`](https://nuxtseo.com/sitemap). It gives both of them the site name and URL. Without `nuxvel.seo`, nuxvel adds none of the tags and serves neither file.

| Option | Value |
|---|---|
| `siteName` | Required. The end of every `<title>`, and `og:site_name`. |
| `siteUrl` | The public origin. Canonical links, `og:url`, image URLs and the sitemap start with it. Without it, the origin of the request is used. |
| `defaultDescription` | `description` and `og:description` of a page that sets none. |
| `defaultImage` | `og:image` of a page that sets none. A path or an absolute URL. |
| `twitter` | The X (Twitter) handle of the site, for `twitter:site`. |
| `indexable` | `false` stops all crawlers. The default is `true`. |
| `ogImage` | `true` renders an Open Graph image for each page. The default is `false`. See [Open Graph images](#open-graph-images). |

The `NUXT_SITE_URL` environment variable overrides `siteUrl` at runtime.

Each page then gets these tags:

```html
<title>First post · The Blog</title>
<link rel="canonical" href="https://blog.example.com/posts/1">
<meta property="og:url" content="https://blog.example.com/posts/1">
<meta name="description" content="Notes on building web apps.">
<meta property="og:site_name" content="The Blog">
<meta property="og:type" content="website">
<meta property="og:description" content="Notes on building web apps.">
<meta property="og:image" content="https://blog.example.com/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@theblog">
```

The title template is `%s %separator %siteName`, with `·` as the separator. A page with no title shows only the site name. The canonical link and `og:url` use the path of the page without its query string. A relative `og:image` becomes an absolute URL on the site URL.

## More than one locale

With two or more [locales](./i18n.md), each page gets `<html lang>`, a canonical link and `og:url` for its own locale, and `hreflang` links to the same page in each locale, with `x-default`. `/sitemap.xml` then redirects to `/sitemap_index.xml`, which lists one sitemap for each locale, for example `/__sitemap__/en-US.xml` and `/__sitemap__/zh-CN.xml`. `robots.txt` points to the index. See [SEO and the sitemap](./i18n.md#seo-and-the-sitemap). An app with one locale keeps the tags and the one `/sitemap.xml` above.

## Page metadata

```vue
<!-- app/pages/posts/[id]/index.vue -->
<script setup lang="ts">
const route = useRoute();
const post = useQuery(useTRPC().post.byId.queryOptions({ id: Number(route.params.id) }));

useSeo(() => ({
  title: post.data.value?.title ?? "Post",
  description: post.data.value?.body.slice(0, 160),
  type: "article",
}));
</script>
```

`useSeo()` sets the tags of one page. It is auto-imported in `app/`. Pass a getter when a value comes from data that loads. The server then renders the tags from the data, and a client navigation updates them.

| Option | Tags |
|---|---|
| `title` | Required. `<title>`, `og:title` and `twitter:title`. The title template adds the site name to `<title>` only. |
| `description` | `description`, `og:description` and `twitter:description`. |
| `image` | `og:image` and `twitter:image`. A path or an absolute URL. |
| `type` | `og:type`: `"article"` or `"website"`. The default is `"website"`. |
| `noindex` | `true` adds `<meta name="robots" content="noindex, nofollow">`. |

For a post with the title "First post", the page renders:

```html
<title>First post · The Blog</title>
<meta property="og:title" content="First post">
<meta name="twitter:title" content="First post">
<meta property="og:type" content="article">
```

An option that you leave out keeps the site default. `useSeo()` also works without `nuxvel.seo`. The page then has no title template, no canonical link and no defaults.

`useSeo()` calls Nuxt's `useSeoMeta()`. Use `useSeoMeta()` or `useHead()` for any other tag.

## Open Graph images

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["@nuxvel/nuxt"],
  nuxvel: {
    seo: { siteName: "The Blog", ogImage: true },
  },
});
```

With `ogImage: true`, each page that calls `useSeo()` without an `image` gets a generated `og:image`. nuxvel installs [`nuxt-og-image`](https://nuxtseo.com/og-image), which renders a PNG from a Vue component with the [Takumi](https://takumi.kane.tw) renderer. Install both packages in the app:

```bash
npm install nuxt-og-image @takumi-rs/core
```

`nuxt-og-image` needs server-side rendering. When `ssr` is `false`, for example in a [Storybook](./storybook.md) build, `useSeo()` sets the meta tags but renders no image.

The image comes from `app/components/OgImage/Default.takumi.vue`. The starter app ships this template:

```vue
<!-- app/components/OgImage/Default.takumi.vue -->
<script setup lang="ts">
defineProps<{ title: string; description?: string; siteName?: string }>();
</script>

<template>
  <div class="flex h-full w-full flex-col justify-between bg-green-500 p-[60px] text-white">
    <span class="text-[32px] font-semibold">{{ siteName }}</span>
    <div class="flex flex-col gap-4">
      <h1 class="m-0 text-[72px] font-bold leading-tight">{{ title }}</h1>
      <p v-if="description" class="m-0 text-[32px]">{{ description }}</p>
    </div>
  </div>
</template>
```

`title` and `description` are the values that the page gives to `useSeo()`. `siteName` is `nuxvel.seo.siteName`. Edit the template to change the design. Tailwind classes work in it. The image is 1200 by 600 pixels. The page gets `og:image`, `twitter:image` and their size tags. The URL starts with `/_og/`:

```html
<meta property="og:image" content="https://blog.example.com/_og/d/c_Default,siteName_The+Blog,title_First+post,....png">
```

A page that gives `image` to `useSeo()` gets no generated image. The choice is made at the first call, so give `image` a value from the start. A page that does not call `useSeo()` keeps `defaultImage`.

The option is off by default. `@takumi-rs/core` is a native renderer of about 5 MB that goes into the server build. The build also copies the Inter font, about 140 KB, into the public files. Each image renders on its first request, and the server keeps it for three days. See the [`nuxt-og-image` documentation](https://nuxtseo.com/og-image) for more templates and options.

### The signing secret

`nuxt-og-image` signs each `/_og/` URL, so a visitor cannot ask the server for an image with other text. The secret is `NUXT_OG_IMAGE_SECRET`. Without it, the build makes a random one and keeps it in the build. A second instance, or the next deploy, then has another secret and refuses the image URLs that the first one wrote into cached pages. In production, with `ogImage: true`, the server does not start without `NUXT_OG_IMAGE_SECRET`, and names it in the error. Make a value one time and keep it:

```bash
npx nuxt-og-image generate-secret
```

Set the same value in the `.env` of the build and of the server, and never change it without need. `nuxvel app:create` writes a random one into `shared/.env` of a VPS when it has none, and the starter's `.env.example` lists it. The build of `nuxvel build` makes its own value when it has none, so set the same value on the server that runs the image. `nuxvel key:rotate` refuses it: it keeps no previous value, so the image URLs in cached pages would stop working. To replace it, set the new value in `.env` and in `shared/.env` (`env:pull` and `env:push`), then deploy.

## robots and sitemap

```txt
# START nuxt-robots (indexable)
User-agent: *
Disallow: 

Sitemap: https://blog.example.com/sitemap.xml
# END nuxt-robots
```

In production, `/robots.txt` allows all crawlers and points to the sitemap. In all other environments, it disallows all paths, and each page has `noindex`. Set `indexable: false` to do the same in production, for example on a staging server.

`/sitemap.xml` lists each page of the app that has no route parameter. A page is not in the sitemap, and has `noindex`, in these cases:

- The page uses the `auth` middleware, or is nested under a page that uses it.
- The route has the `private` preset, or another route rule that sends `X-Robots-Tag: noindex`.

With `nuxvel.seo` set, the `X-Robots-Tag` header of such a page is `noindex, nofollow`.

To add pages with a route parameter, such as `/posts/1`, see the [sources of `@nuxtjs/sitemap`](https://nuxtseo.com/sitemap/guides/dynamic-urls).

Remove `public/robots.txt` from the app. When `@nuxtjs/robots` builds, it moves that file to `public/_robots.txt` and adds its rules to the generated file.

## Testing

```ts
import { expect, getMeta, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { postFactory } from "#nuxvel/factories";

describe("SEO", () => {
  it("renders the post title", async () => {
    const post = await postFactory({ title: "First post" });

    const meta = await getMeta(`/posts/${post.id}`);

    expect(meta["og:title"]).toBe("First post");
  });

  it("renders the Open Graph image", async () => {
    const post = await postFactory({ title: "First post" });
    const { "og:image": image = "" } = await getMeta(`/posts/${post.id}`);

    const response = await guest().fetch(new URL(image).pathname);

    expect(response.headers.get("content-type")).toBe("image/png");
  });

  it("leaves signed-in pages out of the sitemap", async () => {
    const sitemap = await guest().$fetch<string>("/sitemap.xml", { responseType: "text" });

    expect(sitemap).toContain("/sign-in</loc>");
    expect(sitemap).not.toContain("/dashboard</loc>");
  });
});
```

`getMeta(path)` fetches the server render of a page and returns `title`, `canonical` and each meta tag by its `name` or `property`. To read `/sitemap.xml` or `/robots.txt`, fetch it and read the text. To check that a client navigation updates the tags, open the page in a browser with [`visit()`](./testing.md#visit).

## See also

- [Rendering](./rendering.md)
- [Authentication](./auth.md)
- [Testing](./testing.md)
- [Frontend](./frontend.md)
- [Progressive web app](./pwa.md)
