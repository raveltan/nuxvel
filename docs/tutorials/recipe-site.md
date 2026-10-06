# Tutorial: a public recipe site

## Introduction

This tutorial builds Weeknight Kitchen, a public recipe site with a few pages for its authors. Visitors read recipes without an account, in English or in Chinese. Search engines and social sites find each recipe and show it with its title, summary and image. A reader can save a recipe in the browser and install the site as an app. The app shows a recipe that the reader opened before, also without a network. A reader with an account can turn on push notifications, and gets one when an author publishes a recipe.

The chapters use the nuxvel features for a public site:

- `useSeo()`, the title template, canonical links, Open Graph tags and images, structured data, `robots.txt` and the sitemap with the recipe pages
- a rendering preset for each route: `cached` pages for every visitor, `private` pages for the authors, and a part of a page that renders only in the browser
- the cache helpers: `remember()` and the `invalidates` option of an action
- the progressive web app: the manifest, the offline page, the install button and the update toast
- web push: `<PushToggle>`, `sendPush()` and `expectPushSent()`
- accessibility checks in each browser layer, and the choices that keep the pages fast
- English and Chinese: the translation files, `$t` in the pages, the locale switcher, a sitemap for each locale with `hreflang` links, and a mail in the locale of the author

Each chapter adds tests in the layer that owns the check. A functional test checks the server: the head tags that `getMeta()` returns, the sitemap, the response headers, the cache, the push sends and the mails. A component test is a Storybook story with a `play` function. An end-to-end test opens the app in a browser, also offline. See [Testing](../testing.md#introduction) for the three layers.

This tutorial expects that you know the basics of nuxvel. If you do not, do the [first app tutorial](./first-app.md) first. You need Node.js 24 and Docker. Run every command from the app folder, unless a chapter says otherwise.

## 1. Create the app

```bash
npm create nuxvel@latest weeknight-kitchen
cd weeknight-kitchen
npm install
```

See [Starting a new app](../create.md) for what the command writes.

Start the dev services from `docker-compose.yml`, then run the functional tests. The services stay running for the commands of this tutorial. `./nv services down` stops them when you are done:

```bash
./nv services up
npm run test:functional
```

```
◇ Built the app for tests: no earlier build (19.8s)

 Test Files  2 passed (2)
      Tests  5 passed (5)
```

## 2. Recipes

A recipe has a slug for its URL, a title, a summary and a body. An author writes a recipe as a draft, and publishes it later. Generate the recipe as a full resource, with the pages for the authors:

```bash
./nv make:resource recipe slug:string:unique title summary body:text --ui --no-openapi
```

```
✔ Created server/database/schema/recipe.schema.ts
✔ Created shared/schemas/recipe.ts
✔ Created server/privacy/recipe.user-data.ts
✔ Created server/policies/recipe.policy.ts
✔ Created server/actions/recipe/create-recipe.action.ts
✔ Created server/actions/recipe/update-recipe.action.ts
✔ Created server/actions/recipe/delete-recipe.action.ts
✔ Created server/trpc/routers/recipe.router.ts
✔ Created server/trpc/routers/recipe.router.test.ts
✔ Created app/pages/recipe/index.vue
✔ Created app/pages/recipe/new.vue
✔ Created app/components/RecipeForm.vue
◇ Updated types (nuxt prepare) (2.7s)
```

`make:resource` adds an `ownerId` column, which the create action sets from the signed-in user. The pages at `/recipe` and `/recipe/new` use the `auth` middleware, so only a signed-in author opens them. The policy lets only the owner of a recipe, or an admin, change it. See [CLI: make:resource](../cli.md#nuxvel-makeresource-name).

The form does not set the publication date. A separate action sets it, in chapter 7. Add the column to the table by hand. The public pages list the newest recipes first, so give the column an index:

```ts
// server/database/schema/recipe.schema.ts
import { index, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { timestamps } from "@nuxvel/nuxt/database";
import { userTable } from "./auth.schema";

export const recipeTable = pgTable("recipe", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => userTable.id, { onDelete: "cascade" }),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  title: varchar("title", { length: 255 }).notNull(),
  summary: varchar("summary", { length: 255 }).notNull(),
  body: text("body").notNull(),
  publishedAt: timestamp("published_at"),
  ...timestamps(),
}, (table) => [index("recipe_owner_id_idx").on(table.ownerId), index("recipe_published_at_idx").on(table.publishedAt)]);

export type RecipeRow = typeof recipeTable.$inferSelect;
export type NewRecipeRow = typeof recipeTable.$inferInsert;
```

A slug goes into a URL, so it must hold only lowercase letters, digits and dashes. Change the slug field of the input, and add `publishedAt` to the output schema:

```ts
// shared/schemas/recipe.ts
export const createRecipeInput = z.object({
  slug: z.string().trim().max(255).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, digits and dashes"),
  title: z.string().trim().min(1).max(255),
  summary: z.string().trim().min(1).max(255),
  body: z.string().trim().min(1),
});
```

```ts
// shared/schemas/recipe.ts
export const recipeSchema = z.object({
  id: z.number(),
  ownerId: z.string(),
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  body: z.string(),
  publishedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
```

The generated test `server/trpc/routers/recipe.router.test.ts` sends `"Sample text"` as the slug. The new rule refuses it. Replace each `slug: "Sample text"` in that file with `slug: "sample-text"`.

Write the migration, apply it and check it:

```bash
./nv db:generate --name recipes
./nv db:migrate
./nv db:check
```

```
✔ Every foreign key has an index
✔ Every migration is in order
✔ Every migration is safe to deploy
```

### Factories

The tests need recipes, and readers with a push subscription. Generate a factory for each table:

```bash
./nv make:factory recipe
./nv make:factory push-subscriptions
```

```
✔ Created server/factories/recipe.factory.ts
✔ Created server/factories/recipe.factory.test.ts
◇ Updated types (nuxt prepare) (3.0s)
✔ Created server/factories/push-subscriptions.factory.ts
✔ Created server/factories/push-subscriptions.factory.test.ts
◇ Updated types (nuxt prepare) (1.8s)
```

Give the recipe factory realistic values, a slug that is valid in a URL, and a state for a published recipe:

```ts
// server/factories/recipe.factory.ts
import { faker } from "@faker-js/faker";
import { userFactory } from "./users.factory";
import { defineFactory, sequence } from "@nuxvel/nuxt/factories";
import { recipeTable } from "#nuxvel/schema";

export const recipeFactory = defineFactory(recipeTable, {
  ownerId: async () => (await userFactory()).id,
  slug: sequence((n) => `recipe-${n}`),
  title: () => faker.food.dish(),
  summary: () => faker.food.description(),
  body: () => faker.lorem.paragraphs(3),
});

export const publishedRecipeFactory = recipeFactory.state({ publishedAt: new Date("2026-09-01T12:00:00Z") });
```

A row from `recipeFactory()` is a draft. A row from `publishedRecipeFactory()` is published. See [Testing: states](../testing.md#states).

The push service of a browser gives each device an endpoint URL. The server accepts only endpoints on the hosts of the known push services. Make the factory endpoint look like a Google endpoint:

```ts
// server/factories/push-subscriptions.factory.ts
  endpoint: () => `https://fcm.googleapis.com/fcm/send/${crypto.randomUUID()}`,
```

### Seeding the site

Give the demo user some recipes. One recipe has a fixed slug, so you can open it in the browser. One recipe stays a draft:

```ts
// server/seeders/database.seeder.ts
import { publishedRecipeFactory, recipeFactory, userFactory } from "#nuxvel/factories";

const DEMO_EMAIL = "demo@example.com";
const DEMO_PASSWORD = "demo-password";

export const databaseSeeder = defineSeeder(async () => {
  const demo = await userFactory.withPassword(DEMO_PASSWORD)({ name: "Demo User", email: DEMO_EMAIL, emailVerified: true });
  await userFactory.count(3)();

  await publishedRecipeFactory({
    ownerId: demo.id,
    slug: "tomato-soup",
    title: "Tomato soup",
    summary: "A quick soup from a can of tomatoes, an onion and stock.",
  });
  await publishedRecipeFactory.count(5)({ ownerId: demo.id });
  await recipeFactory({ ownerId: demo.id, slug: "lentil-stew", title: "Lentil stew" });

  console.log(`Sign in as ${DEMO_EMAIL} with the password ${DEMO_PASSWORD}`);
});
```

```bash
./nv db:seed
```

```
Sign in as demo@example.com with the password demo-password
✔ Seeded database
```

## 3. The public pages

A visitor reads two kinds of page: the home page with the newest recipes, and the page of one recipe. Both show only published recipes, and both work for a guest.

### Public procedures

The generated router has `authedProcedure` procedures for the authors. Add two `publicProcedure` queries for the visitors. Each query returns only the columns that its page shows. The list of a recipe card has no body and no owner ID:

```ts
// shared/schemas/recipe.ts
export const recipeSlugInput = z.object({ slug: z.string() });

export const publishedRecipeSchema = recipeSchema.pick({ slug: true, title: true, summary: true, body: true, publishedAt: true, updatedAt: true });

export const recipeCardSchema = recipeSchema.pick({ slug: true, title: true, summary: true, publishedAt: true });
```

```ts
// server/trpc/routers/recipe.router.ts
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
// ...the imports of the generated router...

export const recipeRouter = {
  latest: publicProcedure.output(z.array(recipeCardSchema)).query(() =>
    remember("recipes:latest", { minutes: 10 }, () =>
      useDb()
        .select({ slug: recipeTable.slug, title: recipeTable.title, summary: recipeTable.summary, publishedAt: recipeTable.publishedAt })
        .from(recipeTable)
        .where(isNotNull(recipeTable.publishedAt))
        .orderBy(desc(recipeTable.publishedAt))
        .limit(12),
    ),
  ),
  bySlug: publicProcedure
    .input(recipeSlugInput)
    .output(publishedRecipeSchema)
    .query(({ input }) =>
      remember(`recipes:by-slug:${input.slug}`, { hours: 1 }, () =>
        useDb()
          .select()
          .from(recipeTable)
          .where(and(eq(recipeTable.slug, input.slug), isNotNull(recipeTable.publishedAt)))
          .then(firstOrFail),
      ),
    ),
  // ...list, byId, create, update and delete as generated...
};
```

- `latest` returns the 12 newest published recipes. `bySlug` returns one published recipe. A draft or an unknown slug throws `NOT_FOUND` from `firstOrFail`.
- `remember()` keeps each result in Redis. Chapter 6 explains the keys and when the app forgets them.
- The `.output()` schema removes each column that it does not name. `bySlug` reads the full row, but the visitor gets no `ownerId`.

### Saved recipes

A reader saves a recipe in the browser, with no account. The list lives in `localStorage`, so only the browser can read it. Two components use the list, so put it in a composable:

```ts
// app/composables/useSavedRecipes.ts
type SavedRecipe = { slug: string; title: string };

const key = "saved-recipes";

export function useSavedRecipes() {
  const recipes = ref<SavedRecipe[]>([]);

  onMounted(() => {
    recipes.value = JSON.parse(localStorage.getItem(key) ?? "[]");
  });

  function toggle(recipe: SavedRecipe) {
    const others = recipes.value.filter((saved) => saved.slug !== recipe.slug);
    recipes.value = others.length === recipes.value.length ? [...others, recipe] : others;
    localStorage.setItem(key, JSON.stringify(recipes.value));
  }

  return { recipes, toggle };
}
```

The server has no `localStorage`. The composable reads the list in `onMounted`, which runs only in the browser, after hydration. The server render and the first browser render thus have the same empty list, and there is no hydration mismatch.

### The content components

A card shows one recipe in the list:

```vue
<!-- app/components/RecipeCard.vue -->
<script setup lang="ts">
defineProps<{ recipe: RouterOutputs["recipe"]["latest"][number] }>();
</script>

<template>
  <article class="rounded-xl border border-default p-5">
    <h2 class="text-lg font-semibold">
      <NuxtLink :to="{ name: 'recipes-slug', params: { slug: recipe.slug } }" class="hover:text-primary">
        {{ recipe.title }}
      </NuxtLink>
    </h2>
    <p class="mt-1 text-sm text-muted">{{ recipe.summary }}</p>
    <p v-if="recipe.publishedAt" class="mt-3 text-xs text-muted">
      <DateTime :value="recipe.publishedAt" :options="{ dateStyle: 'long' }" />
    </p>
  </article>
</template>
```

The article shows the full recipe, with a button that saves it:

```vue
<!-- app/components/RecipeArticle.vue -->
<script setup lang="ts">
const props = defineProps<{ recipe: RouterOutputs["recipe"]["bySlug"] }>();
const { recipes, toggle } = useSavedRecipes();
const saved = computed(() => recipes.value.some((recipe) => recipe.slug === props.recipe.slug));
const paragraphs = computed(() => props.recipe.body.split(/\n\s*\n/));
</script>

<template>
  <article class="max-w-2xl space-y-4">
    <h1 class="text-3xl font-bold tracking-tight">{{ recipe.title }}</h1>
    <p class="text-lg text-muted">{{ recipe.summary }}</p>
    <div class="flex items-center gap-4">
      <p v-if="recipe.publishedAt" class="text-sm text-muted">
        Published <DateTime :value="recipe.publishedAt" :options="{ dateStyle: 'long' }" />
      </p>
      <UButton
        variant="outline"
        :icon="saved ? 'i-lucide-bookmark-check' : 'i-lucide-bookmark'"
        :label="saved ? 'Saved' : 'Save recipe'"
        @click="toggle({ slug: recipe.slug, title: recipe.title })"
      />
    </div>
    <p v-for="(paragraph, index) in paragraphs" :key="index">{{ paragraph }}</p>
  </article>
</template>
```

`<DateTime>` renders the same text on the server and in the browser. A date from `toLocaleString()` uses the timezone of the server in the HTML and the timezone of the browser after hydration, which causes a hydration mismatch. See [Rendering: dates](../rendering.md#dates).

The body is plain text, and Vue escapes it. A paragraph is the text between two empty lines. To render HTML that an author writes, see [Frontend: rendering HTML](../frontend.md#rendering-html).

### The layout

The public pages use the starter's `home` layout. Replace its header. A public page has a link to the account of the reader, and no user menu. The skip link, the label of the `<nav>` and `<LocaleSwitcher>` stay as in the starter. Chapter 12 explains them:

```vue
<!-- app/layouts/home.vue -->
<template>
  <div class="flex min-h-screen flex-col">
    <MaintenanceBanner />
    <a
      href="#main"
      class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:rounded-md focus:bg-default focus:px-3 focus:py-2"
    >
      {{ $t("app.skipToContent") }}
    </a>
    <header class="border-b border-default">
      <UContainer class="flex h-16 items-center justify-between gap-4">
        <AppLogo />
        <nav :aria-label="$ts('app.mainNav')" class="flex items-center gap-1.5">
          <UButton :to="{ name: 'about' }" color="neutral" variant="ghost" label="About" />
          <UButton :to="{ name: 'saved' }" color="neutral" variant="ghost" label="Saved" />
          <UButton :to="{ name: 'account' }" color="neutral" variant="ghost" label="Account" />
          <LocaleSwitcher />
          <PwaInstallPrompt />
        </nav>
      </UContainer>
    </header>
    <main id="main" class="flex-1">
      <slot />
    </main>
  </div>
</template>
```

Chapter 5 caches the public pages. The server then renders a public page one time, as a guest, and sends that copy to every visitor. A user menu in that copy would show "Sign in" also to a signed-in reader. So the header shows only what is the same for every visitor. The account page in chapter 7 uses the `app` layout, with the user menu.

In `app/components/AppLogo.vue`, change the text `nuxvel` to `Weeknight Kitchen`. The `aria-label` of the logo link comes from the key `app.home` of `locales/en.json`. Change its value to `Weeknight Kitchen home`.

### The pages

Replace the starter's home page:

```vue
<!-- app/pages/index.vue -->
<script setup lang="ts">
definePageMeta({ layout: "home" });
const recipes = useQuery(useTRPC().recipe.latest.queryOptions());

useSeo({ title: "Recipes for a weeknight" });
</script>

<template>
  <UContainer class="space-y-6 py-8">
    <h1 class="text-3xl font-bold tracking-tight">Recipes for a weeknight</h1>
    <QueryState :query="recipes">
      <template #empty>
        <UEmpty title="No recipes yet" />
      </template>
      <template #default="{ data }">
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <RecipeCard v-for="recipe in data" :key="recipe.slug" :recipe="recipe" />
        </div>
      </template>
    </QueryState>
  </UContainer>
</template>
```

Add the page of one recipe. Chapter 4 adds its head tags:

```vue
<!-- app/pages/recipes/[slug].vue -->
<script setup lang="ts">
definePageMeta({ layout: "home" });
const route = useRoute("recipes-slug");
const recipe = useQuery(useTRPC().recipe.bySlug.queryOptions({ slug: route.params.slug }));
</script>

<template>
  <UContainer class="py-8">
    <QueryState :query="recipe">
      <template #error>
        <UEmpty title="Recipe not found" :actions="[{ label: 'All recipes', to: { name: 'index' } }]" />
      </template>
      <template #default="{ data }">
        <RecipeArticle :recipe="data" />
      </template>
    </QueryState>
  </UContainer>
</template>
```

When `bySlug` throws `NOT_FOUND` during the server render, the server renders the `error` slot and answers with HTTP 404. A search engine thus drops a recipe that an author deletes. See [Frontend: errors during server rendering](../frontend.md#errors-during-server-rendering).

Add an about page:

```vue
<!-- app/pages/about.vue -->
<script setup lang="ts">
definePageMeta({ layout: "home" });
useSeo({ title: "About", description: "Who writes Weeknight Kitchen, and how we test each recipe." });
</script>

<template>
  <UContainer class="max-w-2xl space-y-4 py-8">
    <h1 class="text-3xl font-bold tracking-tight">About Weeknight Kitchen</h1>
    <p>We cook each recipe on a weeknight, after work, before we publish it.</p>
    <p>A recipe has at most ten ingredients and takes at most 45 minutes.</p>
  </UContainer>
</template>
```

Add the page of the saved recipes. The list exists only in the browser, so the page renders it in `<ClientOnly>`:

```vue
<!-- app/pages/saved.vue -->
<script setup lang="ts">
definePageMeta({ layout: "home" });
const { recipes } = useSavedRecipes();

useSeo({ title: "Saved recipes", noindex: true });
</script>

<template>
  <UContainer class="space-y-4 py-8">
    <h1 class="text-3xl font-bold tracking-tight">Saved recipes</h1>
    <ClientOnly>
      <UEmpty v-if="recipes.length === 0" title="No saved recipes" description="Select Save recipe on a recipe to keep it here." />
      <ul v-else class="list-disc space-y-1 pl-5">
        <li v-for="recipe in recipes" :key="recipe.slug">
          <ULink :to="{ name: 'recipes-slug', params: { slug: recipe.slug } }">{{ recipe.title }}</ULink>
        </li>
      </ul>
    </ClientOnly>
  </UContainer>
</template>
```

The server renders the header and the heading. The browser renders the list after hydration. Without `<ClientOnly>`, the page would show "No saved recipes" for a moment before the list. Chapter 5 compares this with the `client` preset.

## 4. SEO

Search engines and social sites read the `<head>` of a page, `robots.txt` and `sitemap.xml`. The starter already sets `nuxvel.seo`. Give the site its name, its address and its defaults:

```ts
// nuxt.config.ts
    seo: {
      siteName: 'Weeknight Kitchen',
      siteUrl: 'https://kitchen.example.com',
      defaultDescription: 'Recipes for a weeknight: few steps, short lists.',
      twitter: '@weeknightkitchen',
      ogImage: true,
    },
```

- `siteName` ends each title: "Tomato soup · Weeknight Kitchen".
- `siteUrl` starts each canonical link, `og:url`, image URL and sitemap entry. The `NUXT_SITE_URL` environment variable overrides it at runtime. It is required in production.
- A page that sets no description gets `defaultDescription`.
- `ogImage: true` renders an Open Graph image for each page that calls `useSeo()` without an `image`.

See [SEO: site defaults](../seo.md#site-defaults) for the tags that each page gets.

### The tags of a recipe

Give the recipe page its title, description and type. The data loads in a query, so pass a getter. The server renders the tags from the data, and a client navigation updates them:

```vue
<!-- app/pages/recipes/[slug].vue -->
<script setup lang="ts">
definePageMeta({ layout: "home" });
const route = useRoute("recipes-slug");
const recipe = useQuery(useTRPC().recipe.bySlug.queryOptions({ slug: route.params.slug }));

useSeo(() => ({
  title: recipe.data.value?.title ?? "Recipe",
  description: recipe.data.value?.summary,
  type: "article",
}));

useHead(() => ({
  script: recipe.data.value
    ? [
        {
          type: "application/ld+json",
          innerHTML: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Recipe",
            name: recipe.data.value.title,
            description: recipe.data.value.summary,
            datePublished: recipe.data.value.publishedAt?.toISOString(),
          }),
        },
      ]
    : [],
}));
</script>
```

The template stays the same. `useHead()` adds structured data: a [schema.org `Recipe`](https://schema.org/Recipe) in a `<script type="application/ld+json">` tag. Search engines read it to show a recipe with rich results. The browser does not run a JSON-LD script, so the strict [Content Security Policy](../security.md#security-headers) needs no nonce for it.

The canonical link and `og:url` use the path of the page without its query string. A link with `?ref=newsletter` thus counts as the same page.

### The Open Graph image

With `ogImage: true`, nuxvel renders a PNG for each page from `app/components/OgImage/Default.takumi.vue`. The starter has this template. It shows the site name, the title and the description that the page gives to `useSeo()`. The image renders on its first request, and the server keeps it for three days. See [SEO: Open Graph images](../seo.md#open-graph-images).

### The sitemap

The sitemap lists each page without a route parameter. A page with the `auth` middleware is not in it. The starter has two locales, English and Chinese, so the site has one sitemap for each locale. `/sitemap.xml` redirects to `/sitemap_index.xml`, which lists `/__sitemap__/en-US.xml` and `/__sitemap__/zh-CN.xml`. Chapter 12 adds the Chinese recipe pages.

The recipe pages have the parameter `slug`, so add them from a source. A source is a server route that returns the URLs:

```ts
// server/api/__sitemap__/recipes.ts
import { isNotNull } from "drizzle-orm";
import { recipeTable } from "#nuxvel/schema";

export default defineSitemapEventHandler(async () => {
  const recipes = await useDb()
    .select({ slug: recipeTable.slug, updatedAt: recipeTable.updatedAt })
    .from(recipeTable)
    .where(isNotNull(recipeTable.publishedAt));

  return recipes.map((recipe) => ({ loc: `/recipes/${recipe.slug}`, lastmod: recipe.updatedAt }));
});
```

Register the source, and leave the saved recipes out. That page is different in each browser, so it has no value for a search engine:

```ts
// nuxt.config.ts
  sitemap: { sources: ['/api/__sitemap__/recipes'], exclude: ['/saved'] },
```

`defineSitemapEventHandler()` and the `sitemap` key come from [`@nuxtjs/sitemap`](https://nuxtseo.com/sitemap/guides/dynamic-urls), which nuxvel installs with `nuxvel.seo`. The sitemap fetches the source when it builds, and keeps the result for 10 minutes. `lastmod` tells a crawler when a recipe changed.

`/robots.txt` allows all crawlers in production and points them to `/sitemap_index.xml`. In development, it disallows every path, so a dev server is never indexed. See [SEO: robots and sitemap](../seo.md#robots-and-sitemap).

### Test the SEO

A functional test reads the head tags with `getMeta()`, and fetches the English sitemap and `robots.txt`. It does not read the HTML of the page:

```ts
// tests/functional/seo.test.ts
import { url } from "@nuxt/test-utils/e2e";
import { expect, getMeta, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { publishedRecipeFactory, recipeFactory } from "#nuxvel/factories";

describe("SEO", () => {
  it("renders the head tags of a recipe", async () => {
    await publishedRecipeFactory({ slug: "tomato-soup", title: "Tomato soup", summary: "A quick soup." });

    const meta = await getMeta("/recipes/tomato-soup?ref=newsletter");

    expect(meta.title).toBe("Tomato soup · Weeknight Kitchen");
    expect(meta.canonical).toBe(url("/recipes/tomato-soup"));
    expect(meta.description).toBe("A quick soup.");
    expect(meta["og:type"]).toBe("article");
    expect(meta["og:title"]).toBe("Tomato soup");
    expect(meta["twitter:site"]).toBe("@weeknightkitchen");
  });

  it("renders an Open Graph image for a recipe", async () => {
    await publishedRecipeFactory({ slug: "tomato-soup", title: "Tomato soup" });
    const { "og:image": image = "" } = await getMeta("/recipes/tomato-soup");

    const response = await guest().fetch(new URL(image).pathname);

    expect(response.headers.get("content-type")).toBe("image/png");
  });

  it("lists the published recipes in the sitemap", async () => {
    await publishedRecipeFactory({ slug: "tomato-soup" });
    await recipeFactory({ slug: "lentil-stew" });

    const sitemap = await guest().$fetch<string>("/__sitemap__/en-US.xml", { responseType: "text" });

    expect(sitemap).toContain("/recipes/tomato-soup</loc>");
    expect(sitemap).toContain("/about</loc>");
    expect(sitemap).not.toContain("/recipes/lentil-stew</loc>");
    expect(sitemap).not.toContain("/recipe</loc>");
    expect(sitemap).not.toContain("/saved</loc>");
  });

  it("keeps the saved recipes out of search results", async () => {
    const meta = await getMeta("/saved");

    expect(meta.robots).toBe("noindex, nofollow");
  });

  it("points crawlers to the sitemap", async () => {
    const robots = await guest().$fetch<string>("/robots.txt", { responseType: "text" });

    expect(robots).toContain(`Sitemap: ${url("/sitemap_index.xml")}`);
  });
});
```

The test server gets its own address as `NUXT_SITE_URL`. So the canonical link starts with the address of the test server, and `url()` from `@nuxt/test-utils/e2e` gives the same address. The test build is a production build, so `/robots.txt` allows the crawlers.

```bash
./nv test tests/functional/seo.test.ts
```

```
◇ Dev services are already healthy (docker compose)
◇ Built the app for tests: env npm_config_prefix changed (16.5s)

 Test Files  1 passed (1)
      Tests  5 passed (5)
```

The JSON-LD script is in the HTML of the page, so its test is in the browser, in chapter 11.

## 5. Rendering

By default, the server renders each page on each request. The public pages look the same to every visitor. Cache them with the `cached` preset:

```ts
// nuxt.config.ts
    rendering: { '/': 'cached', '/about': 'cached', '/recipes/**': 'cached' },
```

The site now has three kinds of page:

| Pages | How they render | Why |
|---|---|---|
| `/`, `/about`, `/recipes/**` | `cached`: the server renders the page one time, and every visitor gets that copy. After 60 seconds, the next request gets the copy and makes the server render the page again in the background. This is stale-while-revalidate. On Node, ISR is the same thing. | The page is the same for every visitor. A shared copy costs one render a minute, not one render a request. |
| `/recipe`, `/recipe/new`, `/account` | `private`: the `auth` middleware makes nuxvel render the page on each request, with `Cache-Control: private, no-store` and `X-Robots-Tag: noindex, nofollow`. | The page shows the data of one user. |
| the list on `/saved` | Only in the browser, in `<ClientOnly>`. | The data is in `localStorage`. |

The `cached` response has `Cache-Control: s-maxage=60, stale-while-revalidate`, so a CDN in front of the app can keep the page too. A page with the `auth` middleware is never cached, also when a pattern matches it. See [Rendering: signed-in pages](../rendering.md#signed-in-pages).

A cached page can be up to one minute old. When an author publishes a recipe, the home page shows it after the next render in the background. Chapter 6 makes sure that this render reads the new data.

The `client` preset renders a whole page only in the browser: the server sends an empty shell, with no title and no content. That is correct for a page with no public content, such as an editor. The saved recipes page renders its header and heading on the server. Only the list needs the browser, so `<ClientOnly>` fits better here. See [Rendering: rendering presets](../rendering.md#rendering-presets).

### Test the presets

```ts
// tests/functional/rendering.test.ts
import { actingAs, expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { publishedRecipeFactory, recipeFactory, userFactory } from "#nuxvel/factories";

describe("rendering", () => {
  it("caches the public pages for every visitor", async () => {
    await publishedRecipeFactory({ slug: "tomato-soup" });

    for (const path of ["/", "/about", "/recipes/tomato-soup"]) {
      const response = await guest().fetch(path);
      expect(response.headers.get("cache-control")).toBe("s-maxage=60, stale-while-revalidate");
    }
  });

  it("never caches the pages of an author", async () => {
    const response = await actingAs(await userFactory()).fetch("/recipe");

    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("answers 404 for a draft, and 200 once it is published", async () => {
    const author = await userFactory();
    const draft = await recipeFactory({ ownerId: author.id, slug: "lentil-stew" });

    expect((await guest().fetch("/recipes/lentil-stew")).status).toBe(404);

    await actingAs(author).trpc.recipe.publish({ id: draft.id });

    expect((await guest().fetch("/recipes/lentil-stew")).status).toBe(200);
  });
});
```

The third test calls `recipe.publish`, which chapter 7 adds. Run this file after chapter 7. The test shows that the page cache does not keep a 404. The page of a draft answers 200 at once when the author publishes it.

## 6. The cache

The page cache keeps HTML. The data cache keeps the results of the queries in Redis, so that a render runs no SQL query when the data did not change. `latest` and `bySlug` read their results with `remember()`:

- `remember("recipes:latest", { minutes: 10 }, fn)` returns the value of the key `recipes:latest`. When the key is missing or expired, it runs `fn`, stores the result for 10 minutes and returns it.
- The key of `bySlug` has the slug in it: `recipes:by-slug:tomato-soup`. Each recipe has its own value. A slug cannot contain `:`, so a recipe with the slug `latest` does not collide with the list.
- When `fn` throws, `remember()` stores nothing. A `NOT_FOUND` for a draft thus does not stay in the cache.

A change to a recipe must remove the old values. Give each action that changes a recipe the `invalidates` option:

```ts
// server/actions/recipe/create-recipe.action.ts
export const createRecipeAction = defineAction({
  input: createRecipeInput,
  invalidates: ["recipes:*"],
  handler: async (input, ctx) => {
```

Add the same line to `update-recipe.action.ts` and `delete-recipe.action.ts`. After the transaction of the action commits, the action removes each key that matches the glob `recipes:*`, with `cacheForget()`. When the handler throws, the transaction rolls back and the cache keeps its values. See [Cache: invalidating from an action](../cache.md#invalidating-from-an-action).

The two caches work together. The page cache keeps a page for one minute. When the copy is old, the server renders the page again, and the render calls `latest` and `bySlug`. After an action, the data cache has no value, so the render reads the new rows.

### Test the cache

`expectCacheHit()` and `expectCacheMiss()` check that the app read a key and found a value, or found nothing. `expectCached()` returns the value in the cache:

```ts
// tests/functional/recipe-cache.test.ts
import { actingAs, expect, expectCached, expectCacheHit, expectCacheMiss, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { publishedRecipeFactory, recipeFactory, userFactory } from "#nuxvel/factories";

describe("the recipe cache", () => {
  it("keeps one value for each recipe", async () => {
    await publishedRecipeFactory({ slug: "tomato-soup", title: "Tomato soup" });

    await guest().trpc.recipe.bySlug({ slug: "tomato-soup" });

    const cached = await expectCached("recipes:by-slug:tomato-soup");
    expect(cached).toMatchObject({ title: "Tomato soup" });
  });

  it("reads the latest recipes from the cache until a recipe is published", async () => {
    const author = await userFactory();
    const draft = await recipeFactory({ ownerId: author.id, slug: "lentil-stew" });

    await guest().trpc.recipe.latest();
    await guest().trpc.recipe.latest();

    await expectCacheMiss("recipes:latest", { times: 1 });
    await expectCacheHit("recipes:latest", { times: 1 });

    await actingAs(author).trpc.recipe.publish({ id: draft.id });
    const latest = await guest().trpc.recipe.latest();

    await expectCacheMiss("recipes:latest", { times: 2 });
    expect(latest.map((recipe) => recipe.slug)).toEqual(["lentil-stew"]);
  });

  it("does not keep a missing recipe", async () => {
    const author = await userFactory();
    const draft = await recipeFactory({ ownerId: author.id, slug: "lentil-stew" });

    await expect(guest().trpc.recipe.bySlug({ slug: "lentil-stew" })).rejects.toBeTrpcError("NOT_FOUND");
    await actingAs(author).trpc.recipe.publish({ id: draft.id });

    await expect(guest().trpc.recipe.bySlug({ slug: "lentil-stew" })).resolves.toMatchObject({ slug: "lentil-stew" });
  });
});
```

The second test reads the list two times: one miss, then one hit. After the publish, the next read is a miss again, and it returns the new recipe. After each test, the setup removes the values that the test server stored, so each test starts with an empty cache.

Run the file after chapter 7, because the tests call `recipe.publish`.

## 7. Publishing and web push

An author publishes a draft from `/recipe`. Each reader who turned on push notifications gets one: "New recipe", with the title of the recipe. A click on the notification opens the recipe.

### The VAPID keys

The push services accept a notification only when the server signs it with a VAPID key pair. Write a pair into `.env`:

```bash
./nv push:keys
```

```
✔ Wrote NUXT_PUBLIC_PUSH_VAPID_PUBLIC_KEY and NUXT_PUSH_VAPID_PRIVATE_KEY to .env
```

Set the contact address for the push services in `.env`:

```
NUXT_PUSH_VAPID_SUBJECT=mailto:kitchen@example.com
```

Keep the same pair for as long as the site exists. A new pair ends every subscription. See [Progressive web app: VAPID keys](../pwa.md#vapid-keys).

### The publish action

```bash
./nv make:action recipe/publish-recipe
```

```
✔ Created server/actions/recipe/publish-recipe.action.ts
✔ Created server/actions/recipe/publish-recipe.action.test.ts
◇ Updated types (nuxt prepare) (2.3s)
```

Replace the action:

```ts
// server/actions/recipe/publish-recipe.action.ts
import { eq } from "drizzle-orm";
import { pushSubscriptionsTable, recipeTable } from "#nuxvel/schema";

export const publishRecipeAction = defineAction({
  input: recipeIdInput,
  invalidates: ["recipes:*"],
  handler: async ({ id }, ctx) => {
    const row = await findOrFail(recipeTable, id);
    await authorize(ctx.actor, "update", recipeTable, row);

    if (row.publishedAt) return row;

    const published = await useDb()
      .update(recipeTable)
      .set({ publishedAt: now() })
      .where(eq(recipeTable.id, id))
      .returning()
      .then(firstOrFail);

    const readers = await useDb().selectDistinct({ userId: pushSubscriptionsTable.userId }).from(pushSubscriptionsTable);
    await sendPush(readers.map((reader) => reader.userId), {
      title: "New recipe",
      body: published.title,
      url: `/recipes/${published.slug}`,
    });

    return published;
  },
});
```

- The policy of the recipe decides who publishes: only its owner. Another user gets `FORBIDDEN`.
- A recipe that is published already stays the same, and the readers get no second notification.
- `now()` is the current time of the server. A test can move it. See [Database: the current time](../database.md#the-current-time).
- The readers are the users with a row in `push_subscriptions`. A user gets a row when they turn on push notifications on a device.
- `sendPush()` dispatches the built-in `nuxvel.push` job after the transaction commits. When the update fails, the readers get nothing. The job signs each notification with the VAPID keys and sends it to each device of each reader. See [Progressive web app: sending a notification](../pwa.md#sending-a-notification).

Add the procedure to the router, next to the generated ones:

```ts
// server/trpc/routers/recipe.router.ts
import { publishRecipeAction } from "#server/actions/recipe/publish-recipe.action";
```

```ts
// server/trpc/routers/recipe.router.ts
  publish: authedProcedure
    .input(recipeIdInput)
    .output(recipeSchema)
    .mutation(({ input, ctx }) => publishRecipeAction(input, { actor: ctx.actor })),
```

### The publish button

The generated list at `/recipe` shows the recipes of the author. Show the publication date in place of the body, and a **Publish** button for a draft. In `app/pages/recipe/index.vue`, add the mutation below `const confirm = useConfirm();`:

```ts
// app/pages/recipe/index.vue
const queryCache = useQueryCache();

const { mutate: publish } = useMutation({
  ...toasted(trpc.recipe.publish.mutationOptions(), "Recipe published"),
  onSettled: () => queryCache.invalidateQueries({ key: trpc.recipe.list.key() }),
});
```

In the `columns` of the `<DataTable>`, replace `{ accessorKey: 'body', header: 'Body' }` with `{ accessorKey: 'publishedAt', header: 'Published' }`. Then add a cell for the column, above the `#actions-cell` template:

```vue
<!-- app/pages/recipe/index.vue -->
      <template #publishedAt-cell="{ row }">
        <DateTime v-if="row.original.publishedAt" :value="row.original.publishedAt" />
        <UButton
          v-else
          variant="outline"
          label="Publish"
          :aria-label="`Publish ${row.original.title}`"
          @click="publish({ id: row.original.id })"
        />
      </template>
```

`toasted()` shows a success toast when the mutation succeeds. The page stays open, so a [flash message](../frontend.md#flash-messages) would show only on the next page. `onSettled` fetches the list again, so the row shows its date. Each button has an `aria-label` with the title of the recipe. A screen reader thus tells the buttons apart, and a test finds one by its name.

### The account page

A reader turns on push notifications on their account page. The page uses the `auth` middleware, because the server stores a subscription for a signed-in user:

```vue
<!-- app/pages/account.vue -->
<script setup lang="ts">
definePageMeta({ middleware: "auth", layout: "app" });
useSeo({ title: "Your account" });
</script>

<template>
  <div class="max-w-xl space-y-6">
    <h1 class="text-2xl font-semibold">Your account</h1>
    <UCard>
      <template #header>New recipes</template>
      <p class="mb-4 text-sm text-muted">Get a notification on this device when we publish a recipe.</p>
      <PushToggle />
    </UCard>
    <UButton :to="{ name: 'recipe' }" variant="outline" label="Your recipes" />
  </div>
</template>
```

`<PushToggle>` is a switch with the label "Push notifications". Turned on, it asks the browser for permission, subscribes the device with the public VAPID key and sends the subscription to `POST /api/push/subscribe`. The route stores it for the user and the session. Turned off, it deletes the subscription. It renders nothing while `NUXT_PUBLIC_PUSH_VAPID_PUBLIC_KEY` is not set. See [Progressive web app: subscribing a device](../pwa.md#subscribing-a-device).

### Test the push

The generated test of the action checks nothing useful now. Replace it:

```ts
// server/actions/recipe/publish-recipe.action.test.ts
import { expect, expectNoPushSent, expectPushSent, runAction } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { pushSubscriptionsFactory, publishedRecipeFactory, recipeFactory, userFactory } from "#nuxvel/factories";

describe("recipe/publish-recipe action", () => {
  it("publishes the recipe and notifies each reader with notifications on", async () => {
    const author = await userFactory();
    const reader = await userFactory();
    const otherReader = await userFactory();
    await pushSubscriptionsFactory({ userId: reader.id });
    const recipe = await recipeFactory({ ownerId: author.id, slug: "tomato-soup", title: "Tomato soup" });

    const published = await runAction("recipe.publish-recipe", { id: recipe.id }, { actingAs: author });

    expect(published.publishedAt).toBeInstanceOf(Date);
    await expectPushSent(reader, { title: "New recipe", body: "Tomato soup", url: "/recipes/tomato-soup" });
    await expectNoPushSent(otherReader);
  });

  it("does not notify again for a published recipe", async () => {
    const author = await userFactory();
    const reader = await userFactory();
    await pushSubscriptionsFactory({ userId: reader.id });
    const recipe = await publishedRecipeFactory({ ownerId: author.id });

    await runAction("recipe.publish-recipe", { id: recipe.id }, { actingAs: author });

    await expectNoPushSent(reader);
  });

  it("refuses a user who does not own the recipe", async () => {
    const recipe = await recipeFactory();

    await expect(runAction("recipe.publish-recipe", { id: recipe.id }, { actingAs: await userFactory() })).rejects.toBeTrpcError("FORBIDDEN");
  });
});
```

`expectPushSent(user, match)` passes when `sendPush()` notified the user with a notification that has the `match` fields. A test never sends to a real push service. See [Progressive web app: testing push notifications](../pwa.md#testing-push-notifications).

```bash
./nv test server/actions/recipe/publish-recipe.action.test.ts
./nv test tests/functional/rendering.test.ts tests/functional/recipe-cache.test.ts
```

```
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

```
 Test Files  2 passed (2)
      Tests  6 passed (6)
```

## 8. The installable app

The starter already sets `nuxvel.pwa`. Give the app its name and a short name for the home screen:

```ts
// nuxt.config.ts
    pwa: {
      name: 'Weeknight Kitchen',
      shortName: 'Kitchen',
      themeColor: '#b20d27',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    },
```

The production build serves the web app manifest at `/manifest.webmanifest` and a service worker at `/sw.js`. Replace the placeholder icons in `public/` with your own. A browser offers the install only when the manifest has a 192x192 and a 512x512 PNG icon. See [Progressive web app: installing the app](../pwa.md#installing-the-app).

### Offline

The service worker keeps a copy of each page that it loads from the network. Without a network, it shows that copy, or the `/offline` page for a page that it never loaded. A reader who opened the tomato soup at home thus reads it again in a shop with no signal.

The worker stores a page only when its response allows it. A `cached` page has `Cache-Control: s-maxage=60, stale-while-revalidate`, so the worker stores it. A page for a signed-in user has `Cache-Control: private, no-store`, so the worker never stores the pages of an author. See [Progressive web app: offline](../pwa.md#offline).

The starter has `app/pages/offline.vue`. The server renders it without scripts, because the browser shows it at the URL of another page. Use links on it, not buttons with click handlers.

### Install and update

The `home` layout has `<PwaInstallPrompt>`. It shows an **Install app** button while the browser offers to install the app. After a deploy, the browser finds a new service worker, and `<PwaInstallPrompt>` shows a toast "A new version is available" with a **Reload** action. The new version starts when the reader selects **Reload**, so a reader does not lose what they do on the page.

### See it work

`npm run dev` does not register the service worker, so test the app in a production build. A production server reads no `.env` file and needs the site address and the audit secret:

```bash
npx nuxt build
NUXT_SITE_URL=http://localhost:3000 NUXT_AUDIT_CHAIN_SECRET=$(openssl rand -hex 32) NUXT_OG_IMAGE_SECRET=$(openssl rand -hex 32) node --env-file=.env .output/server/index.mjs
```

Open `http://localhost:3000/recipes/tomato-soup` in Chrome, then reload it, so that the service worker controls the page. In the DevTools, open **Application**, select **Service workers** and set **Offline**. Reload: the recipe shows. Open `/about`, which you did not open before: the offline page shows.

Stop the server. Change the text of `app/pages/about.vue`, build again and start the server. Reload a page that is open: the toast "A new version is available" shows. Select **Reload**, and the page shows the new text.

### Test the manifest

```ts
// tests/functional/pwa.test.ts
import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";

describe("the installable app", () => {
  it("serves the manifest and the service worker", async () => {
    const manifest = await guest().$fetch<{ name: string; short_name: string; icons: { sizes: string }[] }>("/manifest.webmanifest", { responseType: "json" });

    expect(manifest).toMatchObject({ name: "Weeknight Kitchen", short_name: "Kitchen" });
    expect(manifest.icons.map((icon) => icon.sizes)).toEqual(["192x192", "512x512"]);
    expect((await guest().fetch("/sw.js")).status).toBe(200);
  });
});
```

The test app is a production build, so it serves both files.

```bash
./nv test tests/functional/pwa.test.ts
```

```
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

The offline behavior and the install button need a browser. Chapter 11 tests them.

## 9. Accessibility and performance

### Accessibility

The starter's layouts already have a skip link, a labelled `<nav>` and a `<main>` landmark. Each page sets `lang` on `<html>` to the locale of the page, for example `zh-CN` on a Chinese page. The site adds:

- one `<h1>` on each page, and an `<h2>` on each card, so a screen reader can jump between the recipes
- the link of a card is its title, not a "Read more" link without context
- an `aria-label` on each **Publish** button that names the recipe

Two checks keep it so. In a browser test, `expectAccessible(page)` runs axe-core on the page and fails on each WCAG 2.1 AA violation. Call it after each page load, and after a large change to the page. In a story, `@storybook/addon-a11y` runs the same rules after the story renders, with no code. See [Testing: accessibility](../testing.md#accessibility) and [Storybook: accessibility](../storybook.md#accessibility).

### Performance

Each choice below comes from a guide. Together, they keep the work of one page view small:

| Choice | Effect |
|---|---|
| The `cached` preset on the public pages | The server renders a page one time a minute, not one time a request. A CDN can keep it too. See [Rendering](../rendering.md#rendering-presets). |
| `remember()` on `latest` and `bySlug` | A render after a page expired reads Redis, not Postgres, while the data did not change. See [Cache](../cache.md#remembering-values). |
| `latest` selects four columns and 12 rows | A server-rendered page sends the results of its queries in the page payload. A small payload loads and hydrates faster. In development, nuxvel logs a warning when the payload of a page passes 100 KB. See [Rendering: payload size](../rendering.md#payload-size). |
| An index on `published_at` | The list query reads the newest rows from the index, and does not sort the table. |
| `<DateTime>` for each date | The server and the browser render the same text, so there is no hydration mismatch and no second render. See [Rendering: dates](../rendering.md#dates). |
| `<ClientOnly>` for the saved list | The server renders the rest of the page. The browser renders only the list. |
| The service worker | Assets come from the cache of the browser. A page that a reader opened before loads without a network. See [Progressive web app](../pwa.md#offline). |

The Open Graph images have a cost too. `@takumi-rs/core` adds a native renderer of about 5 MB to the server build. Each image renders on its first request. Social sites ask for the image of a page only when someone shares it. See [SEO: Open Graph images](../seo.md#open-graph-images).

## 10. Component tests

A story is one state of one component. Its `play` function acts on the story and checks the result. `npm run test:ui` runs each story in a headless Chromium. The two content components need no server, so the stories need no mocks. Generate a story for each one:

```bash
./nv make:story RecipeCard
./nv make:story RecipeArticle
```

```
✔ Created app/components/RecipeCard.stories.ts
✔ Created app/components/RecipeArticle.stories.ts
```

Each command writes a story that checks that the component rendered. Replace the card story:

```ts
// app/components/RecipeCard.stories.ts
import type { Meta, StoryObj } from "@storybook-vue/nuxt";
import { expect, link, page, text } from "@nuxvel/nuxt/storybook/test";
import RecipeCard from "./RecipeCard.vue";

const meta = {
  component: RecipeCard,
  args: {
    recipe: {
      slug: "tomato-soup",
      title: "Tomato soup",
      summary: "A quick soup from a can of tomatoes.",
      publishedAt: new Date("2026-09-01T12:00:00Z"),
    },
  },
} satisfies Meta<typeof RecipeCard>;
export default meta;

export const LinksToTheRecipe: StoryObj<typeof meta> = {
  play: async () => {
    await expect(link(page, "Tomato soup")).toHaveAttribute("href", "/recipes/tomato-soup");
    await expect(text(page, "A quick soup from a can of tomatoes.")).toBeVisible();
    await expect(text(page, "September 1, 2026")).toBeVisible();
  },
};
```

The link of the card is its title, and it goes to the recipe page. `<DateTime>` formats the date with `dateStyle: "long"`.

The article story starts each story with an empty `localStorage`, with `beforeEach` in `meta`. A story can set its own start state with its own `beforeEach`:

```ts
// app/components/RecipeArticle.stories.ts
import type { Meta, StoryObj } from "@storybook-vue/nuxt";
import { button, expect, heading, page, text } from "@nuxvel/nuxt/storybook/test";
import RecipeArticle from "./RecipeArticle.vue";

const meta = {
  component: RecipeArticle,
  args: {
    recipe: {
      slug: "tomato-soup",
      title: "Tomato soup",
      summary: "A quick soup from a can of tomatoes.",
      body: "Soften the onion in butter.\n\nAdd the tomatoes and the stock. Simmer for 20 minutes.",
      publishedAt: new Date("2026-09-01T12:00:00Z"),
      updatedAt: new Date("2026-09-01T12:00:00Z"),
    },
  },
  beforeEach: () => localStorage.clear(),
} satisfies Meta<typeof RecipeArticle>;
export default meta;

export const SavesTheRecipe: StoryObj<typeof meta> = {
  play: async () => {
    await expect(heading(page, "Tomato soup")).toBeVisible();
    await expect(text(page, "Add the tomatoes and the stock. Simmer for 20 minutes.")).toBeVisible();

    await button(page, "Save recipe").click();

    await expect(button(page, "Saved")).toBeVisible();
    await expect(localStorage.getItem("saved-recipes")).toBe(JSON.stringify([{ slug: "tomato-soup", title: "Tomato soup" }]));
  },
};

export const AlreadySaved: StoryObj<typeof meta> = {
  beforeEach: () => localStorage.setItem("saved-recipes", JSON.stringify([{ slug: "tomato-soup", title: "Tomato soup" }])),
  play: async () => {
    await button(page, "Saved").click();

    await expect(button(page, "Save recipe")).toBeVisible();
    await expect(localStorage.getItem("saved-recipes")).toBe("[]");
  },
};
```

- `SavesTheRecipe` checks that the body shows as paragraphs, and that a click stores the recipe.
- `AlreadySaved` starts with the recipe in the list. The button shows "Saved", and a click removes the recipe.

```bash
npm run test:ui
```

```
 Test Files  4 passed (4)
      Tests  7 passed (7)
```

The other two files are the starter's stories of `UserMenu` and the error page. Each story also gets the accessibility check with axe. See [Storybook: play functions](../storybook.md#play-functions).

## 11. Browser tests

The JSON-LD script, the saved list, the install button, the push switch and the offline pages need a real browser. The starter's `tests/e2e/home.test.ts` checks the starter's home page, so change three of its checks first. After the sign-up, the home page has no user menu. Open the account page to see that the user is signed in:

```ts
// tests/e2e/home.test.ts
    await expect(heading(page, "Recipes for a weeknight")).toBeVisible();
    await link(page, "Account").click();
    await expect(heading(page, "Your account")).toBeVisible();
    await expectRow(userTable, { email, name: "Ada" });
```

In the password reset test, replace the last check with these lines:

```ts
// tests/e2e/home.test.ts
    await expect(heading(resetPage, "Recipes for a weeknight")).toBeVisible();
    await link(resetPage, "Account").click();
    await expect(button(resetPage, email)).toBeVisible();
```

In the 404 test, the **Go home** button now opens a page with the heading "Recipes for a weeknight", in place of "Welcome to nuxvel".

### The site journeys

```ts
// tests/e2e/site.test.ts
import { actingAs, button, expect, expectAccessible, expectPushSent, expectRow, heading, link, text, toast, visit } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { pushSubscriptionsTable } from "#nuxvel/schema";
import { publishedRecipeFactory, recipeFactory, userFactory } from "#nuxvel/factories";

describe("the public site", () => {
  it("reads a recipe and saves it for later", async () => {
    await publishedRecipeFactory({ slug: "tomato-soup", title: "Tomato soup" });

    const page = await visit("/recipes/tomato-soup");
    await expect(heading(page, "Tomato soup")).toBeVisible();
    await expectAccessible(page);

    const structuredData = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}");
    expect(structuredData).toMatchObject({ "@type": "Recipe", name: "Tomato soup" });

    await button(page, "Save recipe").click();
    await expect(button(page, "Saved")).toBeVisible();

    await link(page, "Saved").click();
    await expect(heading(page, "Saved recipes")).toBeVisible();
    await expect(link(page, "Tomato soup")).toBeVisible();
    await expectAccessible(page);
  });

  it("shows a missing recipe with status 404", async () => {
    const page = await visit("/recipes/no-such-recipe", { status: 404 });

    await expect(text(page, "Recipe not found")).toBeVisible();
    await expectAccessible(page);
  });

  it("offers to install the app", async () => {
    const page = await visit("/");
    await page.evaluate(() => {
      const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
        prompt: () => sessionStorage.setItem("install", "prompted"),
        userChoice: Promise.resolve({ outcome: "accepted" }),
      });
      dispatchEvent(event);
    });

    await button(page, "Install app").click();

    await expect(button(page, "Install app")).toBeHidden();
    expect(await page.evaluate(() => sessionStorage.getItem("install"))).toBe("prompted");
  });

  it("notifies a reader who turned on push notifications about a new recipe", async () => {
    const author = await userFactory();
    const reader = await userFactory();
    await recipeFactory({ ownerId: author.id, slug: "lentil-stew", title: "Lentil stew" });

    const readerPage = await actingAs(reader).visit("/account", { permissions: ["notifications"] });
    await readerPage.evaluate(async () => {
      await navigator.serviceWorker.ready;
      Object.defineProperty(PushManager.prototype, "subscribe", {
        value: async () => ({
          toJSON: () => ({ endpoint: "https://fcm.googleapis.com/fcm/send/reader-phone", keys: { p256dh: "p256dh-key", auth: "auth-key" } }),
        }),
      });
    });
    await readerPage.getByRole("switch", { name: "Push notifications" }).click();
    await expect(readerPage.getByRole("switch", { name: "Push notifications" })).toBeChecked();
    await expectRow(pushSubscriptionsTable, { userId: reader.id, endpoint: "https://fcm.googleapis.com/fcm/send/reader-phone" });

    const authorPage = await actingAs(author).visit("/recipe");
    await button(authorPage, "Publish Lentil stew").click();
    await expect(toast(authorPage, "Recipe published")).toBeVisible();

    await expectPushSent(reader, { title: "New recipe", body: "Lentil stew", url: "/recipes/lentil-stew" });
  });
});
```

1. The first test reads the structured data from the page, saves the recipe and opens the saved list. `link(page, "Saved")` is the link in the header. `button(page, "Saved")` is the button of the article. `expectAccessible()` runs after each page.
2. The second test opens a slug that does not exist. `visit()` records a page response with a status of 400 or more as an error, so the test gives `status: 404`.
3. Chromium offers no install in a test. The third test sends the `beforeinstallprompt` event that a browser sends, with a `prompt()` that records the call. The button shows, and a click calls `prompt()`.
4. A headless browser has no push service. The fourth test grants the permission with the `permissions` option, and replaces `PushManager.prototype.subscribe` with a function that returns a fixed subscription. The rest is real: the switch, the route that stores the row, the publish button, the action and `sendPush()`.

The first and the third test open the pages as a guest. The fourth opens two pages as two users, each with its own session.

### Offline

```ts
// tests/e2e/offline.test.ts
// eslint-disable-next-line nuxvel/test-client -- the page goes offline, so visit() would record each failed request
import { createPage, url } from "@nuxt/test-utils/e2e";
import { expect, heading } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { publishedRecipeFactory } from "#nuxvel/factories";

describe("offline", () => {
  it("shows a recipe read before, and the offline page for any other", async () => {
    await publishedRecipeFactory({ slug: "tomato-soup", title: "Tomato soup" });
    await publishedRecipeFactory({ slug: "lentil-stew", title: "Lentil stew" });

    const page = await createPage();
    await page.goto(url("/"), { waitUntil: "hydration" });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.goto(url("/recipes/tomato-soup"), { waitUntil: "hydration" });

    await page.context().setOffline(true);

    await page.goto(url("/recipes/tomato-soup"));
    await expect(heading(page, "Tomato soup")).toBeVisible();

    await page.goto(url("/recipes/lentil-stew"));
    await expect(heading(page, "You are offline")).toBeVisible();
  });
});
```

The first visit installs the service worker. The visit of the tomato soup is the first one that the worker controls, so the worker stores the page. `setOffline(true)` then cuts the network. The tomato soup comes from the cache of the worker. The lentil stew was never loaded, so the worker shows the offline page.

This test uses `createPage()` from `@nuxt/test-utils/e2e`, not `visit()`. Without a network, the app logs an error for each request that fails, for example the payload of a page that a link preloads. `visit()` records each of these errors and fails the test. The comment above the import turns off the rule `nuxvel/test-client` for it. See [Progressive web app: testing](../pwa.md#testing).

```bash
npm run test:e2e
```

```
◇ Dev services are already healthy (docker compose)
◇ Using the test build from 03/10/2026, 1:44:10 am

 Test Files  3 passed (3)
      Tests  9 passed (9)
```

The starter's smoke test opens each page without route parameters. It now also opens `/about`, `/saved`, `/account`, `/recipe` and `/recipe/new`, and runs `expectAccessible()` on each one. See [Testing: smoke tests](../testing.md#smoke-tests).

## 12. English and Chinese

The starter has two locales: English (`en`), the default, and Chinese (`zh`). An English page has no prefix: `/recipes/tomato-soup`. The same page in Chinese is `/zh/recipes/tomato-soup`. The starter's layouts and pages already translate their text with `$t`. The recipe pages of this tutorial still have English text in the templates. This chapter translates them, and gives each search engine and each author the correct language. See [Internationalization](../i18n.md).

The recipes themselves stay in the language that the author writes. Only the text of the site changes with the locale.

### The translation files

The text of each locale is in a global translation file: `locales/en.json` and `locales/zh.json`. Storybook and the mail templates read only the global files, so put each key there, not in a page file. The starter's home page is gone, so delete the `home` keys from both files. Then add these keys to `locales/en.json`:

```json
{
  "nav": { "about": "About", "saved": "Saved", "account": "Account" },
  "recipes": {
    "title": "Recipes for a weeknight",
    "empty": "No recipes yet",
    "notFound": "Recipe not found",
    "all": "All recipes",
    "recipe": "Recipe",
    "published": "Published {date}",
    "save": "Save recipe",
    "saved": "Saved"
  },
  "saved": {
    "title": "Saved recipes",
    "empty": "No saved recipes",
    "hint": "Select Save recipe on a recipe to keep it here."
  },
  "about": {
    "title": "About",
    "description": "Who writes Weeknight Kitchen, and how we test each recipe.",
    "heading": "About Weeknight Kitchen",
    "cooked": "We cook each recipe on a weeknight, after work, before we publish it.",
    "limits": "A recipe has at most ten ingredients and takes at most 45 minutes."
  },
  "mail": {
    "recipePublished": {
      "subject": "Your recipe is published: {title}",
      "heading": "Your recipe is published",
      "body": "Readers can now find {title} on Weeknight Kitchen."
    }
  }
}
```

Add the same keys to `locales/zh.json`, with the Chinese text. Also change `app.home` to `Weeknight Kitchen 首页`:

```json
{
  "nav": { "about": "关于", "saved": "已保存", "account": "账户" },
  "recipes": {
    "title": "工作日晚餐菜谱",
    "empty": "还没有菜谱",
    "notFound": "找不到这个菜谱",
    "all": "所有菜谱",
    "recipe": "菜谱",
    "published": "发布于 {date}",
    "save": "保存菜谱",
    "saved": "已保存"
  },
  "saved": {
    "title": "已保存的菜谱",
    "empty": "没有已保存的菜谱",
    "hint": "在菜谱上选择“保存菜谱”，它就会出现在这里。"
  },
  "about": {
    "title": "关于",
    "description": "谁在写 Weeknight Kitchen，以及我们怎样测试每个菜谱。",
    "heading": "关于 Weeknight Kitchen",
    "cooked": "每个菜谱在发布之前，我们都会在工作日下班后的晚上做一遍。",
    "limits": "每个菜谱最多十种食材，最多用时 45 分钟。"
  },
  "mail": {
    "recipePublished": {
      "subject": "你的菜谱已发布：{title}",
      "heading": "你的菜谱已发布",
      "body": "读者现在可以在 Weeknight Kitchen 上看到《{title}》。"
    }
  }
}
```

`{date}` and `{title}` are placeholders. The code that shows the text gives their values.

### Translating the pages

`$t("key")` gives the text of a key in the locale of the page. A prop that needs a string, for example `label` or `title`, uses `$ts`, which always returns a string. In a script, `ts` from `useI18n()` does the same as `$ts`.

A link with a route name, for example `{ name: 'about' }`, always opens the English page. `$localeRoute()` gives the route in the locale of the page, so a link on `/zh` goes to `/zh/about`. Replace the header of the `home` layout:

```vue
<!-- app/layouts/home.vue -->
<template>
  <div class="flex min-h-screen flex-col">
    <MaintenanceBanner />
    <a
      href="#main"
      class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:rounded-md focus:bg-default focus:px-3 focus:py-2"
    >
      {{ $t("app.skipToContent") }}
    </a>
    <header class="border-b border-default">
      <UContainer class="flex h-16 items-center justify-between gap-4">
        <AppLogo />
        <nav :aria-label="$ts('app.mainNav')" class="flex items-center gap-1.5">
          <UButton :to="$localeRoute({ name: 'about' })" color="neutral" variant="ghost" :label="$ts('nav.about')" />
          <UButton :to="$localeRoute({ name: 'saved' })" color="neutral" variant="ghost" :label="$ts('nav.saved')" />
          <UButton :to="$localeRoute({ name: 'account' })" color="neutral" variant="ghost" :label="$ts('nav.account')" />
          <LocaleSwitcher />
          <PwaInstallPrompt />
        </nav>
      </UContainer>
    </header>
    <main id="main" class="flex-1">
      <slot />
    </main>
  </div>
</template>
```

The title of a page is in the locale of the page too. Give `useSeo()` a getter, so that the title changes when the reader selects another locale:

```vue
<!-- app/pages/index.vue -->
<script setup lang="ts">
definePageMeta({ layout: "home" });
const recipes = useQuery(useTRPC().recipe.latest.queryOptions());
const { ts } = useI18n();

useSeo(() => ({ title: ts("recipes.title") }));
</script>

<template>
  <UContainer class="space-y-6 py-8">
    <h1 class="text-3xl font-bold tracking-tight">{{ $t("recipes.title") }}</h1>
    <QueryState :query="recipes">
      <template #empty>
        <UEmpty :title="$ts('recipes.empty')" />
      </template>
      <template #default="{ data }">
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <RecipeCard v-for="recipe in data" :key="recipe.slug" :recipe="recipe" />
        </div>
      </template>
    </QueryState>
  </UContainer>
</template>
```

```vue
<!-- app/pages/about.vue -->
<script setup lang="ts">
definePageMeta({ layout: "home" });
const { ts } = useI18n();

useSeo(() => ({ title: ts("about.title"), description: ts("about.description") }));
</script>

<template>
  <UContainer class="max-w-2xl space-y-4 py-8">
    <h1 class="text-3xl font-bold tracking-tight">{{ $t("about.heading") }}</h1>
    <p>{{ $t("about.cooked") }}</p>
    <p>{{ $t("about.limits") }}</p>
  </UContainer>
</template>
```

```vue
<!-- app/pages/saved.vue -->
<script setup lang="ts">
definePageMeta({ layout: "home" });
const { recipes } = useSavedRecipes();
const { ts } = useI18n();

useSeo(() => ({ title: ts("saved.title"), noindex: true }));
</script>

<template>
  <UContainer class="space-y-4 py-8">
    <h1 class="text-3xl font-bold tracking-tight">{{ $t("saved.title") }}</h1>
    <ClientOnly>
      <UEmpty v-if="recipes.length === 0" :title="$ts('saved.empty')" :description="$ts('saved.hint')" />
      <ul v-else class="list-disc space-y-1 pl-5">
        <li v-for="recipe in recipes" :key="recipe.slug">
          <ULink :to="$localeRoute({ name: 'recipes-slug', params: { slug: recipe.slug } })">{{ recipe.title }}</ULink>
        </li>
      </ul>
    </ClientOnly>
  </UContainer>
</template>
```

In `app/pages/recipes/[slug].vue`, add `const { ts } = useI18n();` below the query, and change the fallback title and the `error` slot:

```ts
// app/pages/recipes/[slug].vue
  title: recipe.data.value?.title ?? ts("recipes.recipe"),
```

```vue
<!-- app/pages/recipes/[slug].vue -->
      <template #error>
        <UEmpty :title="$ts('recipes.notFound')" :actions="[{ label: $ts('recipes.all'), to: $localeRoute({ name: 'index' }) }]" />
      </template>
```

In `app/components/RecipeCard.vue`, change the `to` of the link to `$localeRoute({ name: 'recipes-slug', params: { slug: recipe.slug } })`.

The article shows "Published" and a date. The word order is different in each language, so the date goes into the text as the placeholder `{date}`. `<i18n-t>` renders the text of `keypath` in the `tag`, and the slot `#date` replaces `{date}`. In `app/components/RecipeArticle.vue`, replace the paragraph with the date, and the `label` of the button:

```vue
<!-- app/components/RecipeArticle.vue -->
      <i18n-t v-if="recipe.publishedAt" keypath="recipes.published" tag="p" class="text-sm text-muted">
        <template #date>
          <DateTime :value="recipe.publishedAt" :options="{ dateStyle: 'long' }" />
        </template>
      </i18n-t>
      <UButton
        variant="outline"
        :icon="saved ? 'i-lucide-bookmark-check' : 'i-lucide-bookmark'"
        :label="saved ? $ts('recipes.saved') : $ts('recipes.save')"
        @click="toggle({ slug: recipe.slug, title: recipe.title })"
      />
```

`<DateTime>` formats the date in the locale of the page: `September 1, 2026` in English and `2026年9月1日` in Chinese. See [Internationalization: Nuxt UI and dates](../i18n.md#nuxt-ui-and-dates).

### The locale switcher

The header shows the starter's `LocaleSwitcher`, a `<USelect>` with the label "Language". It lists the `displayName` of each locale in `i18n.locales` of `nuxt.config.ts`: `English` and `中文`. When the reader selects a locale, the switcher opens the same page in that locale and keeps the choice in the `user-locale` cookie. For a signed-in reader, it also saves the locale on the user. See [Internationalization: links and the locale switcher](../i18n.md#links-and-the-locale-switcher).

### The cached home page

On a page that is not cached, the library redirects `/` to `/zh` when the browser asks for Chinese in its `Accept-Language` header or the `user-locale` cookie is `zh`. Chapter 5 caches `/`, and every visitor gets the same copy. The server renders that copy without the cookies and the headers of the visitor, so the cached `/` never redirects. Every visitor gets the English home page, and a reader selects Chinese with the switcher. The cached copy also sets no cookie. See [Internationalization: cached pages](../i18n.md#cached-pages).

The `rendering` patterns of chapter 5 also apply to the Chinese copy of each page. `/zh`, `/zh/about` and `/zh/recipes/tomato-soup` are cached too.

### Search engines

With `nuxvel.seo` and two locales, each page tells search engines about its other locale. The page `/zh/recipes/tomato-soup` has `<html lang="zh-CN">`, a canonical link to itself and `og:locale` `zh_CN`. It also has a `hreflang` link for each locale, and an `x-default` link to the English page. See [Internationalization: SEO and the sitemap](../i18n.md#seo-and-the-sitemap).

The sitemap of chapter 4 has the recipes only in English. The source returns one URL for each recipe. Add `_i18nTransform: true` to each URL, so that the sitemap also adds the Chinese URL and the `hreflang` links of both:

```ts
// server/api/__sitemap__/recipes.ts
  return recipes.map((recipe) => ({ loc: `/recipes/${recipe.slug}`, lastmod: recipe.updatedAt, _i18nTransform: true }));
```

Now `/__sitemap__/zh-CN.xml` lists `/zh/recipes/tomato-soup`. The page `/saved` is not in the sitemap, and its copy `/zh/saved` is not in it either.

### Validation messages

The validation messages of Zod are in the locale of the call. A tRPC call from a Chinese page gets Chinese messages. The slug of `bySlug` comes from the URL, so a visitor can send any text. Limit it to the length of the column:

```ts
// shared/schemas/recipe.ts
export const recipeSlugInput = z.object({ slug: z.string().max(255) });
```

A slug of 256 characters from a Chinese page fails with `数值过大：期望 string <=255 字符`. A message that the schema sets, such as `Use lowercase letters, digits and dashes` on the slug of `createRecipeInput`, stays the same in each locale. See [Internationalization: validation messages](../i18n.md#validation-messages).

### A mail in the locale of the author

When a recipe is published, its author gets a mail. Generate the mail:

```bash
./nv make:mail recipe.published
```

```
✔ Created server/mail/recipe/published.mail.ts
✔ Created server/mail/recipe/templates/RecipePublished.vue
✔ Created server/mail/recipe/published.mail.test.ts
◇ Updated types (nuxt prepare) (2.8s)
```

The template translates with `$t`, from the same global files as the pages:

```vue
<!-- server/mail/recipe/templates/RecipePublished.vue -->
<script setup lang="ts">
defineProps<{ title: string }>();
</script>

<template>
  <MailLayout :preview="$t('mail.recipePublished.subject', { title })">
    <EHeading>{{ $t("mail.recipePublished.heading") }}</EHeading>
    <EText>{{ $t("mail.recipePublished.body", { title }) }}</EText>
  </MailLayout>
</template>
```

The `subject` gets `t` in its second argument:

```ts
// server/mail/recipe/published.mail.ts
import { h } from "vue";
import { z } from "zod";
import RecipePublished from "./templates/RecipePublished.vue";

export const recipePublishedMail = defineMail({
  input: z.object({ to: z.email(), title: z.string() }),
  subject: ({ title }, { t }) => t("mail.recipePublished.subject", { title }),
  render: (props) => h(RecipePublished, props),
});
```

Send the mail from the publish action, after the push. Import `userTable` from `../../database/schema/auth.schema`:

```ts
// server/actions/recipe/publish-recipe.action.ts
    const owner = await findOrFail(userTable, published.ownerId);
    await sendMail("recipe.published", { to: owner.email, title: published.title }, { locale: owner.locale ?? undefined });

    return published;
```

Without the `locale` option, a mail renders in the locale of the request. The author reads the mail, so the mail uses the locale of the author. The `locale` column of the user gets its value at sign-up, from the page of the sign-up, and the switcher changes it. When it is empty, the mail uses the locale of the request. See [Mail: mail in a locale](../mail.md#mail-in-a-locale).

### Test each language

A functional test checks the head tags of a Chinese page, the sitemaps, the cached home page and a validation message. `guest({ locale: "zh" })` calls tRPC as a guest on a Chinese page:

```ts
// tests/functional/i18n.test.ts
import { url } from "@nuxt/test-utils/e2e";
import { expect, getMeta, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { publishedRecipeFactory } from "#nuxvel/factories";

describe("English and Chinese", () => {
  it("renders the head tags of a page in Chinese", async () => {
    await publishedRecipeFactory({ slug: "tomato-soup", title: "Tomato soup" });

    const home = await getMeta("/zh");
    const recipe = await getMeta("/zh/recipes/tomato-soup");

    expect(home.title).toBe("工作日晚餐菜谱 · Weeknight Kitchen");
    expect(recipe.canonical).toBe(url("/zh/recipes/tomato-soup"));
    expect(recipe["og:locale"]).toBe("zh_CN");
    expect(recipe["og:locale:alternate"]).toBe("en_US");
  });

  it("lists each recipe in the sitemap of each locale, with its alternates", async () => {
    await publishedRecipeFactory({ slug: "tomato-soup" });

    const index = await guest().$fetch<string>("/sitemap_index.xml", { responseType: "text" });
    const chinese = await guest().$fetch<string>("/__sitemap__/zh-CN.xml", { responseType: "text" });

    expect(index).toContain(`<loc>${url("/__sitemap__/en-US.xml")}</loc>`);
    expect(index).toContain(`<loc>${url("/__sitemap__/zh-CN.xml")}</loc>`);
    expect(chinese).toContain(`<loc>${url("/zh/recipes/tomato-soup")}</loc>`);
    expect(chinese).toContain(`hreflang="en-US" href="${url("/recipes/tomato-soup")}"`);
    expect(chinese).not.toContain("/zh/saved</loc>");
  });

  it("serves the cached home page to a Chinese browser without a redirect", async () => {
    const response = await guest().fetch("/", { headers: { "accept-language": "zh-CN" }, redirect: "manual" });

    expect(response.status).toBe(200);
  });

  it("answers a Chinese visitor with the validation messages in Chinese", async () => {
    await expect(guest({ locale: "zh" }).trpc.recipe.bySlug({ slug: "a".repeat(256) })).rejects.toHaveValidationErrors({
      slug: "数值过大：期望 string <=255 字符",
    });
  });
});
```

The generated test of the mail checks the text of the generated template. Replace it with a test that renders the mail in each locale. `it.for` runs the test one time for each row:

```ts
// server/mail/recipe/published.mail.test.ts
import { expect, renderMail } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";

describe("recipe.published mail", () => {
  it.for([
    ["en", "Your recipe is published: Tomato soup", "Readers can now find Tomato soup on Weeknight Kitchen."],
    ["zh", "你的菜谱已发布：Tomato soup", "读者现在可以在 Weeknight Kitchen 上看到《Tomato soup》。"],
  ])("renders in %s", async ([locale, subject, body]) => {
    const mail = await renderMail("recipe.published", { to: "ada@example.com", title: "Tomato soup" }, { locale });

    expect(mail.subject).toBe(subject);
    expect(mail.text).toContain(body);
  });
});
```

In the first test of `server/actions/recipe/publish-recipe.action.test.ts`, check that the author gets the mail. Add `expectMailSent` to the import:

```ts
// server/actions/recipe/publish-recipe.action.test.ts
    await expectMailSent("recipe.published", { to: author.email, title: "Tomato soup" });
```

```bash
./nv test tests/functional/i18n.test.ts server/mail/recipe/published.mail.test.ts server/actions/recipe/publish-recipe.action.test.ts
```

```
 Test Files  3 passed (3)
      Tests  9 passed (9)
```

A story with the `locale` parameter renders in that locale. Add a story to `app/components/RecipeArticle.stories.ts`:

```ts
// app/components/RecipeArticle.stories.ts
export const InChinese: StoryObj<typeof meta> = {
  parameters: { locale: "zh" },
  play: async () => {
    await expect(text(page, "2026年9月1日")).toBeVisible();

    await button(page, "保存菜谱").click();

    await expect(button(page, "已保存")).toBeVisible();
  },
};
```

The **Locale** menu in the toolbar of Storybook shows each story in the locale that you select. See [Storybook: Locale](../storybook.md#locale).

`visit(path, { locale: "zh" })` opens the Chinese copy of a page, and the browser gets the Chinese locale. An end-to-end test reads a recipe in Chinese, and switches a page to Chinese with the switcher:

```ts
// tests/e2e/i18n.test.ts
import { url } from "@nuxt/test-utils/e2e";
import { button, expect, expectAccessible, fillForm, heading, link, visit } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { publishedRecipeFactory } from "#nuxvel/factories";

describe("the site in Chinese", () => {
  it("reads a recipe in Chinese and saves it", async () => {
    await publishedRecipeFactory({ slug: "tomato-soup", title: "Tomato soup" });

    const page = await visit("/recipes/tomato-soup", { locale: "zh" });
    await expect(page).toHaveURL(url("/zh/recipes/tomato-soup"));
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expect(page.locator('link[rel="alternate"][hreflang="en-US"]')).toHaveAttribute("href", url("/recipes/tomato-soup"));
    await expectAccessible(page);

    await button(page, "保存菜谱").click();
    await link(page, "已保存").click();

    await expect(heading(page, "已保存的菜谱")).toBeVisible();
    await expect(link(page, "Tomato soup")).toHaveAttribute("href", "/zh/recipes/tomato-soup");
    await expectAccessible(page);
  });

  it("switches the page to Chinese", async () => {
    const page = await visit("/about");

    await fillForm(page, { Language: "中文" });

    await expect(heading(page, "关于 Weeknight Kitchen")).toBeVisible();
    await expect(page).toHaveURL(url("/zh/about"));
  });
});
```

`fillForm()` selects the option `中文` in the field with the label "Language", which is the switcher.

```bash
npm run test:ui
npm run test:e2e
```

```
 Test Files  4 passed (4)
      Tests  8 passed (8)
```

```
 Test Files  4 passed (4)
      Tests  11 passed (11)
```

## 13. Run every test layer

```bash
npm run typecheck
npm run test:functional
npm run test:ui
npm run test:e2e
npm run test:arch
```

```
 Test Files  12 passed (12)
      Tests  33 passed (33)
```

```
✔ All architecture rules pass
```

The functional run has the starter's tests, the generated tests of the resource and the factories, and the tests of chapters 4 to 8 and 12. `npm test` runs `test:functional`, then `test:ui`. It does not run the browser tests.

`./nv test:arch` checks the rules of the framework. Five rules are for tests:

- A functional test does not read the HTML of a page. So the JSON-LD check is in a browser test, and the SEO tests use `getMeta()`.
- A test or a story imports `expect` only from `@nuxvel/nuxt/testing` or `@nuxvel/nuxt/storybook/test`.
- A test with other data uses `it.for`, not `it.each` or `it()` in a loop.
- A test gets its user from a factory with `actingAs()` or `signIn()`, not from a sign-up in a helper or a hook.
- A test reaches the app with `guest()`, `actingAs()` and `visit()`, not with `$fetch`, `fetch` or `createPage` of `@nuxt/test-utils`.

See [CLI: nuxvel test:arch](../cli.md#nuxvel-testarch).

Each check of this tutorial is in one layer:

| Check | Layer | File |
|---|---|---|
| The title, canonical link, description and Open Graph tags of a recipe | Functional | `tests/functional/seo.test.ts` |
| The head tags of a Chinese page, and a validation message in Chinese | Functional | `tests/functional/i18n.test.ts` |
| The sitemap of each locale lists each recipe with its `hreflang` links | Functional | `tests/functional/i18n.test.ts` |
| The cached home page does not redirect a Chinese browser | Functional | `tests/functional/i18n.test.ts` |
| The mail to the author in English and in Chinese | Functional | `server/mail/recipe/published.mail.test.ts` |
| The Open Graph image is a PNG | Functional | `tests/functional/seo.test.ts` |
| The sitemap lists the published recipes and leaves out the drafts, the author pages and the saved list | Functional | `tests/functional/seo.test.ts` |
| `robots.txt` points to the sitemap | Functional | `tests/functional/seo.test.ts` |
| The public pages are cached, the author pages are private | Functional | `tests/functional/rendering.test.ts` |
| The cache keeps the results, and a publish removes them | Functional | `tests/functional/recipe-cache.test.ts` |
| A publish notifies each subscribed reader one time, mails the author, and only the owner publishes | Functional | `server/actions/recipe/publish-recipe.action.test.ts` |
| The manifest and the service worker | Functional | `tests/functional/pwa.test.ts` |
| A card links to its recipe | Component | `app/components/RecipeCard.stories.ts` |
| The article saves and removes a recipe | Component | `app/components/RecipeArticle.stories.ts` |
| The article in Chinese, with the date in Chinese | Component | `app/components/RecipeArticle.stories.ts` |
| The structured data, the saved list and the accessibility of each page | End-to-end | `tests/e2e/site.test.ts` |
| The install button | End-to-end | `tests/e2e/site.test.ts` |
| A reader turns on push and gets a notification for a new recipe | End-to-end | `tests/e2e/site.test.ts` |
| A recipe read before shows offline, any other page shows the offline page | End-to-end | `tests/e2e/offline.test.ts` |
| A recipe in Chinese with its `lang` and `hreflang`, and the locale switcher | End-to-end | `tests/e2e/i18n.test.ts` |

## What this tutorial leaves out

- Any signed-in user can write and publish recipes. To give only some users that right, see the roles in the [invoicing tutorial](./invoices.md).
- The publish button shows no error when the mutation fails.
- The home page shows only the 12 newest recipes. A longer list needs pages. See [Database: pagination](../database.md#pagination).
- No page is prerendered at build time. Each public page renders on the server, at most one time a minute.
- A recipe has one language. The site does not store a Chinese version of a recipe.
- The author pages (`/recipe`, `/recipe/new` and `/account`) and the push notification keep their English text. Translate them with the same steps as the public pages.
- `sendPush()` gets the IDs of all readers in one call. A site with many thousands of readers would send from a job, in batches. See [Queues](../queues.md).
- No test covers the update toast, because the test runs one build. See the steps in chapter 8 to see it work.
