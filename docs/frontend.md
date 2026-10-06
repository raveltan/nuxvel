# Frontend

## Introduction

nuxvel pages read and write data through the typed API, [`$api`](./api.md#calling-from-the-client). Forms use `useActionForm()`, which binds a shared schema and a mutation to a Nuxt UI `<UForm>`. Pages show the loading, error and empty states of a query with `<QueryState>`. Lists stay current with `useLiveQuery()` and `optimistic()`.

## Nuxt UI

```vue
<!-- app/app.vue -->
<script setup lang="ts">
const uiLocale = useUiLocale();
</script>

<template>
  <UApp :locale="uiLocale">
    <NuxtRouteAnnouncer />
    <NuxtAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
```

`@nuxvel/nuxt` installs [Nuxt UI](https://ui.nuxt.com). When your `nuxt.config.ts` sets no `css`, the module also adds a Tailwind CSS entry with Nuxt UI and the contrast overrides. When it sets `css`, you own the entry. The starter's `app/assets/css/main.css` is one:

```css
@import "tailwindcss";
@import "@nuxt/ui";
@import "@nuxvel/nuxt/ui.css";
```

Import `tailwindcss` in one stylesheet only, or Tailwind loads twice. Every `U*` component is available with no setup. The starter's `app.vue` wraps the app in `<UApp>`. Keep `<UApp>`, because toasts and overlays need it. Keep `<NuxtAnnouncer>`, because forms announce their errors through it. `useUiLocale()` gives the Nuxt UI locale of the current [i18n locale](./i18n.md#nuxt-ui-and-dates), so the labels of the Nuxt UI components are in the language of the page.

Icons render as inline `<svg>` elements (`icon: { mode: "svg" }`), so they load under the strict Content Security Policy. Each icon on a page adds its SVG to the HTML and its data to the page payload. Set your own `icon.mode` in `nuxt.config.ts` to change this.

The app's own server sends the icons (`icon: { fallbackToApi: false }`). The browser never requests an icon from `api.iconify.design`, which the Content Security Policy blocks in production. The server reads the icons from the installed `@iconify-json/*` packages. `@nuxvel/nuxt` installs `@iconify-json/lucide`, the icon set of Nuxt UI. To use icons of a different set, install its package, for example `npm install @iconify-json/simple-icons`.

### Colour contrast

```css
/* app/assets/css/main.css */
html.light {
  --ui-primary: var(--ui-color-primary-800);
}
```

Nuxt UI's default shades fail WCAG AA contrast. Its `500` colors fail against white, its `700` colors fail against their own `subtle` and `soft` backgrounds, and its muted and dimmed text fails against white and gray backgrounds. `@nuxvel/nuxt/ui.css` keeps the colors of the app and uses darker shades of them in light mode. It sets `--ui-primary`, `--ui-secondary`, `--ui-success`, `--ui-info`, `--ui-warning` and `--ui-error` to the `800` shades, `--ui-text-muted` to neutral `600` and `--ui-text-dimmed` to neutral `500`. In dark mode, it sets `--ui-text-dimmed` to neutral `400` and keeps the other Nuxt UI shades. To use other shades, override these variables in your CSS file after the import of `@nuxvel/nuxt/ui.css`, with the selector `:root:not(.dark)`. Then check the result with [`expectAccessible()`](./testing.md#accessibility).

### Opting out

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["@nuxvel/nuxt"],
  nuxvel: { ui: false },
});
```

Set `nuxvel.ui` to `false` to use your own markup. The default is `true`. With `ui: false`:

- The module does not install Nuxt UI and does not add a stylesheet. Remove `<UApp>` from `app.vue`.
- `useActionForm()` drives a plain `<form>` through `form.errors`. See [Forms without Nuxt UI](#forms-without-nuxt-ui).
- `<QueryState>` renders plain markup for the slots you leave out.
- `toasted()` and `useConfirm()` are not auto-imported.
- `<DataTable>`, `<SearchInput>`, `<UploadField>`, `<AuthForm>`, `<SocialSignIn>`, `<PresenceAvatars>`, `<TypingIndicator>`, `<NotificationBell>` and `<MaintenanceBanner>` are not registered. Build your own bell with `useNotifications()`.
- A [flash message](#flash-messages) shows no toast. Render `useFlash()` yourself.
- `<Maintenance>` renders plain markup. See [Maintenance mode](./maintenance.md#in-the-app).
- The starter layouts use `U*` components. Rewrite them without Nuxt UI.

## Pages

```vue
<!-- app/pages/posts/[id]/index.vue -->
<script setup lang="ts">
const route = useRoute("posts-id");

function edit() {
  return navigateTo({ name: "posts-id-edit", params: { id: route.params.id } });
}
</script>
```

Put pages in `app/pages/`, as in any Nuxt app. nuxvel turns on Nuxt's `experimental.typedPages`, so every page has a typed route name. `useRoute(name)` gives the params of that page with their types. In an end-to-end test, `visit({ name: "posts-id", params: { id } })` takes the same typed route, see [visit](./testing.md#visit).

### Route names

The route name of a page comes from its file path under `app/pages/`. The path segments are joined with `-`. A segment `index` is dropped, and a param `[id]` becomes `id`.

| File in `app/pages/` | Route name |
| --- | --- |
| `index.vue` | `index` |
| `sign-in.vue` | `sign-in` |
| `posts/index.vue` | `posts` |
| `posts/[id]/index.vue` | `posts-id` |
| `posts/[id]/edit.vue` | `posts-id-edit` |

`definePageMeta({ name: "post" })` gives a page a fixed name. This name stays the same when you move the file. vue-router writes all route names and their params to `.nuxt/types/typed-router.d.ts`. `nuxt prepare` and the dev server write this file again when a page changes.

### Links

Use a route name in every link to a page:

```vue
<template>
  <NuxtLink :to="{ name: 'posts' }">All posts</NuxtLink>
  <ULink :to="{ name: 'posts-id', params: { id: post.id } }">{{ post.title }}</ULink>
  <UButton :to="{ name: 'posts', query: { page: 2 } }" label="Next" />
</template>
```

```ts
await navigateTo({ name: "posts-id-edit", params: { id: post.id } });
await useRouter().push({ name: "index" });
```

The typecheck checks a route name. It fails on a name that does not exist and on a `params` object without a param that the page needs. A path string such as `"/posts"` is autocompleted, but its type accepts any string, so `"/postz"` also compiles. A link with a path string breaks with no error when the page moves.

A link with no `params` object compiles, also on a page that has params. vue-router then uses the params of the current route. For example, `{ name: 'posts-id-edit' }` on the page `posts-id` goes to the edit page of the same post.

### Renaming or moving a page

1. Move or rename the file in `app/pages/`.
2. Run `npm run dev` or `npx nuxt prepare` to write the route names again.
3. Run `npm run typecheck`. Each link to the old name is an error.
4. Change each link to the new name.

A route name is a string literal type, so your editor finds all references to it. A rename in the editor changes all links to that name.

`nuxvel test:arch` runs the ESLint rule `nuxvel/typed-routes`. The rule flags an internal path string in a link: a string or a template literal that starts with `/` in the `to` of `<NuxtLink>`, `<ULink>` and `<UButton>`, and in `navigateTo()`, `router.push()` and `router.replace()`. It allows paths under `/api`, `/webhooks` and `/_nuxvel`, and full URLs. See [CLI: test:arch](./cli.md#nuxvel-testarch).

The server owns the paths under `/api`, `/webhooks` and `/_nuxvel`. A page under one of these prefixes fails `nuxt build`, and the error names the page file.

A file in `server/routes/` at the path of a page also fails the build. For example, `server/routes/posts/[slug].get.ts` and `app/pages/posts/[id].vue` both answer `/posts/<value>`. The error names both files. Rename one of them.

## Forms

```sh
nuxvel make:resource post title body:text --ui
```

With `--ui`, `nuxvel make:resource` writes the pages of the resource: a list, a new page and an edit form that opens in a modal on the list, with one form control for each field. See [CLI: make:resource](./cli.md#nuxvel-makeresource-name). The new page is a form on `useActionForm()`:

```vue
<!-- app/pages/post/new.vue -->
<script setup lang="ts">
definePageMeta({ middleware: "auth" });

const trpc = useTRPC();
const queryCache = useQueryCache();

const form = useActionForm(createPostInput, trpc.post.create.mutationOptions(), {
  defaults: { title: "", body: "" },
  onSuccess: async (created) => {
    queryCache.setQueriesData<RouterOutputs["post"]["list"] | undefined>(
      { key: trpc.post.list.key() },
      (list) => list && { ...list, rows: [created, ...list.rows], total: list.total + 1 },
    );
    queryCache.invalidateQueries({ key: trpc.post.key() });
    await navigateTo({ name: "post" });
  },
});

useSeo({ title: "New post" });
</script>

<template>
  <div class="max-w-xl space-y-6">
    <h1 class="text-2xl font-semibold">New post</h1>
    <UForm :ref="form.ref" :schema="form.schema" :state="form.state" class="space-y-4" @submit="form.submit">
      <UFormField name="title" label="Title">
        <UInput v-model="form.state.title" class="w-full" />
      </UFormField>
      <UFormField name="body" label="Body">
        <UTextarea v-model="form.state.body" class="w-full" />
      </UFormField>
      <UAlert v-if="form.formError" color="error" :title="form.formError" />
      <UButton type="submit" :loading="form.pending" label="Create post" />
    </UForm>
  </div>
</template>
```

`onSuccess` puts the new row into the cached lists at once, then refetches them, and opens the list. For a form that no resource has, write the same code by hand.

`useActionForm(schema, mutationOptions, options)` is auto-imported. Call it inside `setup()`. Pass the action's input schema from `shared/schemas/` and the options of a tRPC mutation. Bind `ref`, `schema`, `state` and `submit` to `<UForm>`.

| Option | Description |
|---|---|
| `defaults` | The initial form state. `v-model` binds to `form.state`. A field can start as `undefined`, for example a required select. The schema then stops the submit until the user sets a value. |
| `onSuccess` | Runs with the mutation's result after a successful submit. |
| `failures` | Maps a typed failure code to a field. See [Typed failures on a field](#typed-failures-on-a-field). |
| `warnUnsaved` | Asks before the user leaves the page with unsaved changes. The default is `true` when `defaults` has an `id`, as in an edit form, and `false` otherwise. See [Unsaved changes](#unsaved-changes). |

| Property | Description |
|---|---|
| `form.ref`, `form.schema`, `form.state`, `form.submit` | Bind these to `<UForm>`. |
| `form.errors` | The messages for each field, from the schema and from the server. |
| `form.formError` | The message of a failure that belongs to no field. |
| `form.pending` | `true` while the mutation runs. |

A submit while the mutation runs does nothing. Each submit sends the same idempotency key. When the procedure uses [`idempotent()`](./api.md#idempotent-mutations), a second submit of the same state gets the first result, and the mutation does not run again. A changed field gives new input, so the mutation runs.

The mutation receives `form.state` as typed (`z.input`), not the schema's parsed output. The schema only checks the state in the browser. The procedure on the server parses the input once, so a schema that coerces or transforms works as expected.

### Validation errors

The form checks the input with the schema in the browser first. Invalid input does not reach the server. Each message shows under its `<UFormField>`, and `aria-describedby` links the message to the input. After a failed submit, the form puts focus on the first invalid field.

### Server field errors

The server can reject a field that the browser accepted. This occurs when the input schema fails on the server, or when a write breaks a [unique constraint](./database.md#unique-constraints) on one column. The message shows under the matching field. It stays there until the value of that field changes.

### Form errors

A failure that belongs to no field goes into `form.formError`. The form also announces the message to screen readers through `<NuxtAnnouncer>` in `app.vue`. Show `form.formError` on the page, for example in a `<UAlert>`.

An unexpected server error arrives as "Something went wrong (ref: <request id>)". `form.formError` and the error state of `<QueryState>` show this text. See [What the client sees](./api.md#what-the-client-sees).

When the server cannot be reached, they show "Can't reach the server. Check your connection and try again.", and the error has the code `NETWORK_ERROR`. See [When the server cannot be reached](./api.md#when-the-server-cannot-be-reached).

### Unsaved changes

```ts
const form = useActionForm(updatePostInput, trpc.post.update.mutationOptions(), {
  defaults: { id: post.id, title: post.title, body: post.body },
});
```

An edit form asks "You have unsaved changes. Leave this page?", in the page locale (see [i18n: the nuxvel components](./i18n.md#the-nuxvel-components)), when the user follows a link away while `form.state` differs from the saved state. The browser shows its own prompt when the user closes or reloads the tab. The saved state is `defaults`, and then the state of the last successful submit, so the `navigateTo()` in `onSuccess` goes through with no prompt.

A form whose `defaults` has an `id` counts as an edit form. Set `warnUnsaved: true` to ask on another form, or `warnUnsaved: false` to never ask.

### Typed failures on a field

```ts
const form = useActionForm(updatePostInput, trpc.post.update.mutationOptions(), {
  defaults: { id: post.id, title: post.title, body: post.body },
  failures: { "post.body-empty": "body" },
});
```

Some [typed failures](./actions.md#typed-failures) belong to one field. Map the failure code to the field name with `failures`. When the action calls `fail("post.body-empty")`, the declared message shows under the `body` field. It stays there until the value of `body` changes.

A code that is not in the map goes into `form.formError`. The field names are type-checked against the top-level keys of the schema input. The failure codes are type-checked against the codes that the actions under `server/actions/` declare in `errors`. A code that no action declares does not compile. The check does not know which action the procedure calls, so a code of another action still compiles.

### Forms without Nuxt UI

```vue
<template>
  <form @submit.prevent="form.submit">
    <label for="title">Title</label>
    <input id="title" v-model="form.state.title" />
    <p v-for="message in form.errors.title" :key="message">{{ message }}</p>

    <p v-if="form.formError" role="alert">{{ form.formError }}</p>
    <button type="submit" :disabled="form.pending">Create post</button>
  </form>
</template>
```

Without `<UForm>`, call `form.submit()` from a plain form and show `form.errors`. `form.errors` is the `fields` map of the [validation error shape](./validation.md#error-shape). The schema and the server both fill it. The errors stay until the next submit. A plain form does not move focus to the first invalid field.

### Form errors without useActionForm

```vue
<script setup lang="ts">
const trpc = useTRPC();
const errors = useFormErrors();
const title = ref("");

async function save() {
  errors.clear();
  try {
    await trpc.post.create.mutate({ title: title.value, body: "" });
  } catch (error) {
    errors.set(error);
  }
}
</script>

<template>
  <form @submit.prevent="save">
    <label for="title">Title</label>
    <input id="title" v-model="title" />
    <p v-for="message in errors.fields.title" :key="message">{{ message }}</p>

    <p v-if="errors.formError" role="alert">{{ errors.formError }}</p>
    <button type="submit">Create post</button>
  </form>
</template>
```

`useFormErrors()` is auto-imported. Use it for a form that calls something other than one mutation, so `useActionForm()` does not fit. `errors.set(error)` takes the error that a call threw:

- A tRPC error with `data.fields` fills `errors.fields`, keyed by field path.
- A `$fetch` error from a [validated route](./validation.md#validating-a-plain-route) fills `errors.fields` in the same way.
- A `ZodError`, for example from `schema.safeParse()` in the browser, fills `errors.fields`.
- Any other error puts its message in `errors.formError`.

`errors.clear()` empties both.

## Success toasts

```ts
const trpc = useTRPC();
const form = useActionForm(
  updatePostInput,
  toasted(trpc.post.update.mutationOptions(), "Post saved"),
  {
    defaults: { id: post.id, title: post.title, body: post.body },
    onSuccess: () => navigateTo({ name: "posts" }),
  },
);
```

`toasted(mutationOptions, title)` adds a Nuxt UI success toast to a mutation. The toast shows each time the mutation succeeds. `toasted()` is auto-imported. Call it inside `setup()`.

- The second argument is the toast title. To make the title from the result, pass a function: `` toasted(options, (post) => `Saved ${post.title}`) ``.
- `toasted()` accepts any options that `useMutation()` accepts. Use it with `useActionForm()`, with `useMutation()` and around [`optimistic()`](#optimistic-updates).
- A failure shows no toast. Show the error on the page, as `form.formError` does. A toast closes after some seconds, but an error must stay until the user acts.
- Screen readers announce the toast. The toast stays on screen when `onSuccess` goes to a different page.
- The toast replaces a [flash message](#flash-messages) of the mutation. The next page does not show that flash message.
- `toasted()` needs Nuxt UI and `<UApp>`. With `nuxvel: { ui: false }`, it is not auto-imported.

## Flash messages

```ts
// server/trpc/routers/post.router.ts
export const postRouter = {
  create: authedProcedure
    .input(createPostInput)
    .output(postSchema)
    .mutation(async ({ input, ctx }) => {
      const post = await createPostAction(input, { actor: ctx.actor });
      flash("Post created");
      return post;
    }),
};
```

```ts
// app/pages/posts/new.vue
const form = useActionForm(createPostInput, trpc.post.create.mutationOptions(), {
  defaults: { title: "", body: "" },
  onSuccess: () => navigateTo({ name: "posts" }),
});
```

A flash message is a message for the next page load only. Call `flash(message)` on the server. The next page shows the message as a toast. The page after that does not show it again.

`flash()` is auto-imported on the server. Call it from an action, a tRPC mutation or an event handler while a request runs. Outside a request, for example in a job, it does nothing.

The message travels in a short-lived `nuxvel-flash` cookie on the response. The toast shows when the next page renders on the server. It also shows when the next page comes from a client-side `navigateTo()`, as in the example. A mutation that does not navigate keeps the message until the next navigation. A page that stays open after a mutation can show its own toast with [`toasted()`](#success-toasts). `toasted()` removes the flash message, so the user sees one message. A page that a script fetches does not take the message. When the PWA service worker fetches the next page, the browser takes the message after the page loads.

### Message types

```ts
flash("Post deleted", { type: "warning" });
```

| `type` | Toast colour |
|---|---|
| `"success"` | `success`. This is the default. |
| `"error"` | `error` |
| `"info"` | `info` |
| `"warning"` | `warning` |

### Flash messages without Nuxt UI

```vue
<!-- app/layouts/default.vue -->
<script setup lang="ts">
const flashes = useFlash();
</script>

<template>
  <p v-for="flash in flashes" :key="flash.message" role="status">
    {{ flash.message }}
  </p>
  <slot />
</template>
```

`useFlash()` is auto-imported. It returns a ref with the flash messages of the current page. Each message has a `message` and a `type`. Each navigation replaces the list. With Nuxt UI, the toasts come from the same list, so you do not need `useFlash()`.

## Confirm dialogs

```vue
<!-- app/pages/posts/index.vue -->
<script setup lang="ts">
const confirm = useConfirm();

async function confirmDelete(post: { id: number; title: string }) {
  const confirmed = await confirm({
    title: "Delete post?",
    description: `"${post.title}" will be deleted.`,
    confirmLabel: "Delete",
    color: "error",
  });
  if (confirmed) deletePost({ id: post.id });
}
</script>
```

`useConfirm()` returns a `confirm(options)` function. The function opens a Nuxt UI modal with a cancel button and a confirm button. It resolves to `true` when the user confirms, and to `false` when the user cancels.

`useConfirm()` is auto-imported. Call it inside `setup()`. It needs Nuxt UI and `<UApp>`. With `nuxvel: { ui: false }`, it is not auto-imported.

| Option | Description |
|---|---|
| `title` | The dialog title. Required. |
| `description` | The text under the title. |
| `confirmLabel` | The label of the confirm button. The default is `"Confirm"`, in the page locale. |
| `cancelLabel` | The label of the cancel button. The default is `"Cancel"`, in the page locale. |
| `color` | The Nuxt UI colour of the confirm button, such as `"error"`. The default is `"primary"`. |
| `ui` | Classes for the slots of the `UModal` of the dialog, as the `ui` prop of `UModal`. |

The dialog opens with focus on the cancel button. Escape, the cancel button and a click outside the dialog cancel. When the dialog closes, focus goes back to the element that opened it.

## Data tables

```vue
<!-- app/pages/posts/index.vue -->
<script setup lang="ts">
const trpc = useTRPC();
const route = useRoute();
const input = computed(() => listQueryParams(postListInput.catch({ sort: [], filters: {} }).parse(route.query)));
const posts = useQuery(() => trpc.post.list.queryOptions(input.value));
</script>

<template>
  <DataTable
    :query="posts"
    :columns="[
      { accessorKey: 'title', header: 'Title' },
      { id: 'actions', header: 'Actions' },
    ]"
    :list="postListColumns"
    search="Search posts"
  >
    <template #empty>
      <UEmpty title="No posts yet" />
    </template>
    <template #actions-cell="{ row }">
      <UButton :to="{ name: 'posts-id-edit', params: { id: row.original.id } }" label="Edit" />
    </template>
  </DataTable>
</template>
```

`<DataTable>` shows one page of a query in a Nuxt UI `UTable`. The query must return a `Paginated` object, as a procedure that returns [`paginate()`](./database.md#pagination) does. `UPagination` shows under the table when there is more than one page.

- `query` is the value that `useQuery()` or `useLiveQuery()` returns, as is or wrapped in `reactive()`. `<QueryState>` renders the first load and the error state. When the page or the search changes, and on each refetch, the table keeps its rows, sets `aria-busy` and shows a loading bar until the new rows arrive.
- `columns` are the `UTable` columns. Without them, `UTable` makes one column for each field of a row.
- `search` is the label of a [`<SearchInput>`](#search-input) above the table. The input shows only when you set it.
- `list` is the options of the list's [`listQuery()`](./database.md#sorting-and-filtering), such as `postListColumns`. The header of each sortable column becomes a button: a click sorts by it ascending, then descending, then not at all, and a shift-click adds it as the next sort column. A filter bar shows a control for each filter: a text input (sent 300 ms after the user stops typing), a yes/no select, a multi-select, or two date inputs. Each active filter shows as a chip that removes it, next to **Clear all filters**.
- `ui` gives classes to the slots of the inner `UTable` (`root`, `base`, `thead`, `td`, ...), as the `ui` prop of `UTable`. It is typed from `UTable`.
- `loading-color` and `loading-animation` set the loading bar of a refetch, as the props of `UTable`. To set them for every table, use `ui.table.defaultVariants` in `app.config.ts`.
- The `loading` slot replaces the first load, before any rows arrive. The `error` slot replaces the error state and gets `{ error, retry }`. Without them, the table shows the states of [`<QueryState>`](#page-states).
- Every other slot goes to `UTable`. A cell slot, such as `actions-cell`, gets `{ row }`. `row.original` is the row, typed from the procedure. The `empty` slot renders when the page has no rows.

```vue
<DataTable :query="posts" :columns="columns" loading-color="neutral" loading-animation="swing">
  <template #loading>
    <USkeleton class="h-64 w-full" />
  </template>
  <template #error="{ error, retry }">
    <UAlert color="error" :title="error.message" :actions="[{ label: 'Reload', onClick: retry }]" />
  </template>
</DataTable>
```

The page number, the search text, the sort and the filters live in the URL query, as `?page=`, `?q=`, `?sort=title:asc,createdAt:desc` and one key per filter. The page links are real links, and a new search, sort or filter resets the page. So a reload and the back and forward buttons keep them. The page builds the query input from the URL with the same `listQuery()` schema. `.catch({ sort: [], filters: {} })` changes a URL that is not valid to the first page with no sort and no filter, and `listQueryParams()` turns the result back into the flat input of the procedure. Without sorting and filters, `paginationSchema.catch({}).parse(route.query)` is enough.

To change a row from a cell, pass the same input to [`optimistic()`](#optimistic-updates) as its key: `key: () => trpc.post.list.key(input.value)`.

`<DataTable>` is registered only when Nuxt UI is on.

`nuxvel make:resource --ui` writes a list page on `<DataTable>` and the forms on `useActionForm()`, with a column and a control for each field. A reference to a table with a CRUD router is a `<USelect>` with the rows of that table. The list sorts and filters by the `<name>ListColumns` of the resource. Each row of the list has an **Edit** button, which opens the edit form in a modal at `?edit=<id>`, and a **Delete** button, which removes the row at once with `optimistic()` and puts it back if the server refuses. A saved or created row goes into the cached lists at once, and the lists then load again from the server. See [`make:resource`](./cli.md#nuxvel-makeresource-name).

## File uploads

```vue
<!-- app/pages/profile.vue -->
<script setup lang="ts">
const trpc = useTRPC();
const form = useActionForm(setAvatarInput, trpc.profile.setAvatar.mutationOptions(), {
  defaults: { key: "" },
  onSuccess: () => navigateTo({ name: "index" }),
});
</script>

<template>
  <UForm :ref="form.ref" :schema="form.schema" :state="form.state" @submit="form.submit">
    <UploadField
      v-model="form.state.key"
      name="profile-avatar"
      field="key"
      label="Upload a new avatar"
      accept="image/png,image/jpeg,image/webp"
    />
    <UButton type="submit" :disabled="!form.state.key" :loading="form.pending">
      Save avatar
    </UButton>
  </UForm>
</template>
```

`<UploadField>` is a Nuxt UI file field for an [upload](./storage.md#uploads). When the user chooses a file, the field sends it to storage and shows a progress bar. Then it sets `v-model` to the storage key of the file.

- `name` is the name of the upload, as in `server/uploads/<name>.ts`. The type allows only the names of your uploads.
- `v-model` is a string. It is `""` until the upload finishes, and it goes back to `""` when the user chooses a different file.
- The key is under `tmp/`. Send it to an action that calls [`promoteUpload()`](./storage.md#keeping-an-upload).
- When the server refuses the file, the field shows the message of the server under the field. Examples are a file that is too large, or a type that is not in `allowedTypes`.
- `field` is the name of the field in the surrounding `UForm`, given to the `<UFormField>` as `name`. Set it to the state key that holds the upload key, here `field="key"`. A validation error on that key, or a server error such as the one of `promoteUpload()`, then shows under the upload field. Without `field`, the `<UFormField>` has no name, and an error on `key` shows under no field. `name` stays the name of the upload.
- `ui` gives classes to the slots of the inner `UFileUpload`, as its `ui` prop. It is typed from `UFileUpload`.
- `accept` sets the file types that the file picker shows. The server still checks `allowedTypes`.
- Other attributes, such as `label`, `description` and `class`, go to the `<UFormField>` of the field.
- The `uploading` slot replaces the progress bar while the file uploads. It gets `{ file, progress }`. `progress` goes from 0 to 100, and is `null` while the size of the upload is unknown.
- `<UploadField>` is registered only when Nuxt UI is on.

```vue
<UploadField v-model="form.state.key" name="profile-avatar" field="key">
  <template #uploading="{ file, progress }">
    <p class="mt-2 text-sm text-muted">
      Uploading {{ file.name }}<span v-if="progress !== null">: {{ progress }}%</span>
    </p>
  </template>
</UploadField>
```

### Uploading without the field

```vue
<script setup lang="ts">
const coverKey = ref("");
const { upload, uploading, progress } = useUpload("post-cover");

async function onChange(event: Event) {
  const file = event.target instanceof HTMLInputElement ? event.target.files?.[0] : undefined;

  if (file) coverKey.value = await upload(file);
}
</script>

<template>
  <input type="file" accept="image/png,image/jpeg" :disabled="uploading" @change="onChange" />
  <progress v-if="uploading" :value="progress ?? undefined" max="100" />
</template>
```

`useUpload(name)` is the composable that `<UploadField>` uses. It is auto-imported and works without Nuxt UI. `upload(file)` asks the server for a presigned URL, sends the file to storage and resolves to the key under `tmp/`.

- `uploading` is `true` while a file uploads.
- `progress` is the percentage sent. It is `null` when the browser cannot measure it.
- When the server refuses the file, `upload()` rejects with an `Error`. Its message is the message of the server, for example the reason for a file that is too large. When storage refuses the `PUT`, the message says so.

## Replacing a nuxvel component

A component in `app/components/` with the same name as a nuxvel component replaces it everywhere. The nuxvel components are `DataTable`, `SearchInput`, `UploadField`, `QueryState` and the others in this guide. Nuxt registers the component of the app in place of the one of the module, and it shows no warning. Inside nuxvel, `<DataTable>` renders `<SearchInput>` and `<QueryState>` by name, so a replacement of these also applies there.

```vue
<!-- app/components/SearchInput.vue -->
<script setup lang="ts">
const q = defineModel<string>({ default: "" });
</script>

<template>
  <UInput v-model="q" icon="i-lucide-search" />
</template>
```

This replacement keeps the `v-model` of the original. It does not write `?q=` to the URL, so `<DataTable>` then searches without a change of the URL.

The replacement must keep the props, the events and the slots of the original, because nuxvel components and your pages use them. See the TSDoc of the component for them. To style a component and keep its behaviour, use its `ui` prop or the `ui` config of `app.config.ts` first.

Two limits:

- The `.vue` files of the nuxvel components are not exported. A replacement cannot import the original and wrap it. It must be a whole component.
- The dialog of `useConfirm()` cannot be replaced. `use-confirm.ts` imports `ConfirmDialog.vue` directly and does not look up a registered component. Style it with the `ui` option of `useConfirm()`.

## Search input

```vue
<!-- app/pages/posts/index.vue -->
<script setup lang="ts">
const q = ref("");
const posts = useQuery(() => useTRPC().post.list.queryOptions({ q: q.value }));
</script>

<template>
  <SearchInput v-model="q" aria-label="Search posts" placeholder="Search posts" />
</template>
```

`<SearchInput>` is a Nuxt UI `UInput` for search text. It shows a search icon, and a clear button when it has text. The value goes to `v-model` and to the URL query as `?q=`:

- 300 ms after the user stops typing.
- At once when the user presses Enter or clicks the clear button.

A new value removes `?page=` from the URL, so the results start on the first page. The input starts from `?q=`, and it follows `?q=` when the back and forward buttons change it. Give it an `aria-label` or a `placeholder`. Other attributes go to the `<input>` element.

`<DataTable>` shows a `<SearchInput>` when you set its `search` prop. To search rows on the server, see [Full-text search](./search.md).

`<SearchInput>` is registered only when Nuxt UI is on.

## Maintenance banner

```vue
<!-- app/app.vue -->
<template>
  <UApp>
    <MaintenanceBanner />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
```

`<MaintenanceBanner>` tells the open tabs when the app goes down for maintenance and when it is back, with no reload. While the app is down, it shows the message of `nuxvel down`. When the app is back, it says `The app is back.` and has a `Reload` button. For a banner of your own, use `useMaintenance()`. See [Maintenance mode](./maintenance.md#the-banner).

`<MaintenanceBanner>` is registered only when Nuxt UI is on.

## Page states

```vue
<!-- app/pages/posts/index.vue -->
<script setup lang="ts">
const posts = $api.post.list.useQuery();
</script>

<template>
  <QueryState :query="posts">
    <template #empty>
      <UEmpty
        title="No posts yet"
        :actions="[{ label: 'Write the first post', to: { name: 'posts-new' } }]"
      />
    </template>
    <template #default="{ data }">
      <PostList :posts="data" />
    </template>
  </QueryState>
</template>
```

`<QueryState>` is auto-registered. It takes the result of [`.useQuery()`](./api.md#caching-queries-pinia-colada), or the value that `useQuery()` returns, and renders one slot for each state of the query.

| Slot | Renders when | Default with Nuxt UI | Default with `ui: false` |
|---|---|---|---|
| `loading` | the first response has not arrived | three `USkeleton` lines in a `role="status"` region that announces "Loading…" | a `role="status"` paragraph "Loading…" |
| `error` | the query failed | a `UAlert` "Something went wrong." with the error message and a "Try again" button | a `role="alert"` block with the same text and button |
| `empty` | the data is an empty array, `null` or `undefined` | a `UEmpty` "Nothing here yet." | a paragraph "Nothing here yet." |
| `default` | there is data | nothing | nothing |

The default texts follow the page locale (see [i18n: the nuxvel components](./i18n.md#the-nuxvel-components)). To replace a default, give the slot. The `empty` state usually needs its own message and a primary action. The `error` slot receives `{ error, retry }`. `retry()` fetches the query again. The `default` slot receives `{ data }`, typed without `null` and `undefined`.

When the server cannot be reached, the `error` slot receives an error with the code `NETWORK_ERROR` and a message for people. `isNetworkError(error)` is then `true`. See [When the server cannot be reached](./api.md#when-the-server-cannot-be-reached).

### Errors during server rendering

When a tRPC query fails with `NOT_FOUND`, `FORBIDDEN` or `UNAUTHORIZED` while the server renders the page, the server renders the `error` slot and answers with HTTP 404, 403 or 401. When two of these codes occur on one page, the page gets the status of the first. So a link to a deleted post shows the error state of the page, not the error page.

When a query fails with a different error, the server answers with the error page and HTTP 500. To show the `error` slot in place of the error page, set `ssrCatchError: true` on the query:

```ts
const invite = useQuery({ ...trpc.invite.show.queryOptions({ id }), ssrCatchError: true });
```

The page then renders with HTTP 200. Use `ssrCatchError: true` for an error that the visitor can expect, such as an expired link.

In both cases, the payload carries the tRPC error to the browser, with its message, its code and its `data`. So the page does not fetch the query again when it hydrates.

## Live lists

```vue
<!-- app/pages/posts/index.vue -->
<script setup lang="ts">
const trpc = useTRPC();
const posts = useLiveQuery(trpc.post.list.queryOptions(), {
  channel: "posts",
  on: {
    created: (rows, payload) => {
      const post = postSchema.parse(payload);

      return rows.some((row) => row.id === post.id) ? rows : [...rows, post];
    },
    updated: (rows, payload) => {
      const post = postSchema.parse(payload);

      return rows.map((row) => (row.id === post.id ? post : row));
    },
    deleted: (rows, { id }) => rows.filter((row) => row.id !== id),
  },
});
</script>

<template>
  <QueryState :query="posts">
    <template #default="{ data }"><PostList :posts="data" /></template>
  </QueryState>
</template>
```

`useLiveQuery(queryOptions, { channel, on })` is auto-imported. It runs a tRPC query and changes the cached result from the events of a [realtime channel](./realtime.md). The list stays current without polling and without a refetch. This example needs a `posts` channel that declares `created`, `updated` and `deleted` events.

- It returns what `useQuery()` returns, typed by the procedure. `<QueryState>` and `data` work in the same way.
- `on` maps the channel's declared events to patches. Each patch gets the cached data and the event payload, and returns the new cached value. The payload type is the output of that event's schema.
- The payload arrives as JSON. Parse dates again with the [shared schema](./validation.md), as `postSchema.parse` does above.
- The composable ignores an event with no patch. It patches nothing before the first response arrives.
- A `created` event can name a row that the list already holds. The query can fetch the row after the broadcast, or `optimistic()` can add it first. So the `created` patch above skips an ID that is already in the list.
- For a query whose input changes, pass a getter, as with `useQuery()`: `useLiveQuery(() => trpc.post.byId.queryOptions({ id: id.value }), { ... })`. A new input starts a new fetch. Later events patch the entry for the new input.
- The component joins the channel on mount and leaves it on unmount. It uses the connection that all `useChannel()` calls on the page share.
- After a reconnect that missed more events than the replay buffer holds, the query fetches again. See [the resync event](./realtime.md#the-resync-event).

### Fetching again on an event

Some events do not hold the new data, or a patch cannot find the correct result. An example is a list that the server filters and paginates. For these events, use `refetch` in place of `on`:

```ts
// app/pages/tickets/[id].vue
const ticket = useLiveQuery(() => trpc.ticket.show.queryOptions({ id }), {
  channel: "tickets",
  refetch: { updated: (payload) => payload.id === id },
});
```

- `refetch` maps the channel's declared events to `true` or to a predicate on the payload. `true` fetches the query again on each such event. A predicate fetches it again only when it returns `true`.
- One `useLiveQuery()` can use `on` and `refetch` together. When `refetch` fetches the query again, the `on` patch of that event does not run.
- A disabled query (`enabled: false` in the options) does not fetch again.
- A failed fetch sets the query's `error`, as with `useQuery()`. It does not give an unhandled rejection.

To patch from the mutations of this tab, use `optimistic()`. The two work together, because both write to the same cache entry.

For the notifications of the signed-in user, use `useNotifications()` or `<NotificationBell>`. They stay current in the same way. See [Notifications](./notifications.md#reading-in-the-app).

## Presence

```vue
<!-- app/pages/posts/[id]/edit.vue -->
<script setup lang="ts">
const route = useRoute();
const id = Number(route.params.id);
const { user } = useUser();
const { members, setState } = usePresence("posts", { id });
const others = computed(() => members.value.filter((member) => member.userId !== user.value?.id));
const title = ref("");
</script>

<template>
  <PresenceAvatars :members="others" />
  <UInput
    v-model="title"
    aria-label="Title"
    @input="setState({ typing: true })"
    @blur="setState({ typing: false })"
  />
  <TypingIndicator :members="others" />
</template>
```

`usePresence(channel, params)` is auto-imported. It joins one room of a [presence channel](./realtime.md#presence) and shows who else is on the page. This example needs a `posts` channel with `presence: { state: z.object({ typing: z.boolean() }) }`. In place of the name, it also takes the channel from `$channels`, for example `usePresence($channels.posts, { id })`. In the app, `$channels.posts` holds only the channel name.

- `members` lists one member for each signed-in user in the room, the current user included. Each member has `userId`, `name`, `avatar`, `state` and `connections`. `state` is typed by the channel's `state` schema. Every `usePresence()` of the same room on a page shares one list.
- `isPresent(userId)` tells if that user is in the room.
- `setState(partial)` merges into the state of the current user. Calls within 300 ms go to the server as one request, so you can call it on each key press.
- The component joins the room on mount and leaves it on unmount. It uses the connection that all `useChannel()` calls on the page share. It does nothing during SSR.
- The return type is `PresenceRoom<"posts">`. For a channel from `$channels`, it is `PresenceRoomOf<State>`. Both types are auto-imported in the app.

| Component | Props | Shows |
|---|---|---|
| `<PresenceAvatars>` | `members`, `max` (default 5) | A `UAvatarGroup` of the members, with each name in a tooltip. A member without an `avatar` shows initials. |
| `<TypingIndicator>` | `members` | `Ada is typing…`, `Ada and Bea are typing…` or `Ada and 2 others are typing…`, in the page locale, in a polite live region. |

`<TypingIndicator>` needs a `state` schema with a `typing` boolean. Both components are registered only when Nuxt UI is on.

## Optimistic updates

```ts
const trpc = useTRPC();

const { mutate: deletePost, error: deleteError } = useMutation(
  optimistic(trpc.post.delete.mutationOptions(), {
    key: () => trpc.post.list.key(),
    apply: (rows, input) => rows.filter((row) => row.id !== input.id),
  }),
);
```

`optimistic()` changes a cached query before the server answers. Here the post leaves the list at once. If the server refuses the delete, the post comes back, and `deleteError` holds the error, typed as `Error`, so `deleteError.message` needs no check. When the mutation settles, `optimistic()` fetches the query again, so the server's answer wins.

Wrap the options that you pass to `useActionForm()` in `optimistic()`, and the form works the same way. See [API: optimistic updates](./api.md#optimistic-updates) for the full reference.

## Layouts

```vue
<script setup lang="ts">
definePageMeta({ middleware: "auth", layout: "app" });
</script>
```

The starter has four layouts in `app/layouts/`, built with Nuxt UI. Each layout gives the page a skip link and a `<main>` landmark. Each layout except `auth` also has a labelled `<nav>`. The layouts are your files, so change them as you need. Select a layout for each page with `definePageMeta`.

| Layout | For | What it adds |
|---|---|---|
| `home` | the welcome page | a header with **Sign in** and **Sign up** links, or a menu of the signed-in user with **Sign out** and the [push notification toggle](./pwa.md#subscribing-a-device). Also the `<MaintenanceBanner>`, a `<NotificationBell>` and the [install prompt](./pwa.md#the-install-prompt) |
| `default` | public pages | a header with a link home, the `<MaintenanceBanner>`, a `<NotificationBell>` and the install prompt |
| `app` | signed-in pages | the header, the `<MaintenanceBanner>`, a `<NotificationBell>` and `<UserMenu>`, a user menu with the user's email and "Sign out" |
| `auth` | sign-in and sign-up | a centred card |

`<UserMenu>` in the `app` layout, and the menu of the `home` layout, sign out with [`useUser().signOut()`](./auth.md#reading-the-current-user), then go to `/`. `app.vue` renders the layout through `<NuxtLayout>` inside `<UApp>`, next to `<NuxtRouteAnnouncer>` and `<NuxtAnnouncer>`.

The starter's `nuxt.config.ts` sets `<html lang="en">` and a default `<title>`. Keep both, because WCAG requires them.

## Rendering HTML

```vue
<script setup lang="ts">
const trpc = useTRPC();
const route = useRoute();
const { data: post } = useQuery(
  trpc.post.byId.queryOptions({ id: Number(route.params.id) }),
);
</script>

<template>
  <SafeHtml v-if="post" :html="post.body" />
</template>
```

`<SafeHtml :html>` renders an HTML string inside a `<div>`. The component is auto-registered. Its `html` prop takes a `SanitizedHtml`, the type that [`sanitizeHtml()`](./security.md#sanitizing-html) returns. A plain `string` fails `nuxt typecheck`.

The example needs a `body` column that stores sanitized HTML. Give the column the `SanitizedHtml` type, so the type stays the same from the database to the component:

```ts
// server/database/schema/post.schema.ts
body: text("body").$type<SanitizedHtml>().notNull(),
```

Do not use `v-html` in your pages and components. The `architecture` preset of `@nuxvel/nuxt/eslint` reports each `v-html` in a `.vue` file under `app/`, with the rule `nuxvel/no-raw-v-html`. [`nuxvel test:arch`](./cli.md#nuxvel-testarch) runs the same rule:

```
v-html renders HTML that nothing sanitized, use <SafeHtml :html> with sanitizeHtml() output
```

## Accessibility lint

```ts
// eslint.config.ts
import accessibility from "@nuxvel/nuxt/eslint";

export default [...accessibility];
```

```json
// package.json
{ "scripts": { "lint": "eslint app" } }
```

`@nuxvel/nuxt/eslint` is a flat-config preset. It applies the recommended rules of `eslint-plugin-vuejs-accessibility` to every `.vue` file. The rules find missing labels, missing alt text, click handlers without keyboard support and incorrect ARIA. The preset parses `<script lang="ts">` blocks with `@typescript-eslint/parser`.

Add these dev dependencies: `eslint`, `eslint-plugin-vuejs-accessibility`, `@typescript-eslint/parser` and `jiti`. ESLint needs `jiti` to load a `.ts` config.

The same entry also exports `architecture`, the rules that [`nuxvel test:arch`](./cli.md#nuxvel-testarch) checks. They include the `v-html` rule from [Rendering HTML](#rendering-html). Add it after `accessibility`, which sets the Vue parser that the `v-html` rule needs:

```ts
// eslint.config.ts
import accessibility, { architecture } from "@nuxvel/nuxt/eslint";

export default [...accessibility, ...architecture];
```

## Testing

```ts
// tests/e2e/post.test.ts
import { actingAs, button, expect, expectAccessible, field } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { userFactory } from "../../server/factories/users.factory";

describe("new post form", () => {
  it("shows an empty title under its field", async () => {
    const page = await actingAs(await userFactory()).visit("/post/new");
    await button(page, "Create post").click();

    await expect(field(page, "Title")).toHaveAccessibleDescription(/>=1 characters/);
    await expectAccessible(page);
  });
});
```

Test pages end to end with Playwright. The first `visit()` in a file starts a browser for the file. [`actingAs(user).visit(path)`](./testing.md#visit) signs the user in, opens the page and waits for hydration. It fails the test when the page has an error, for example an error in the browser console. Call [`expectAccessible(page)`](./testing.md#accessibility) after each page load and after the page changes, for example after a failed submit. Find elements with the [locator helpers](./testing.md#find-elements), such as `button()` and `field()`.

```ts
await button(page, "Create post").click();
await expect(page).toHaveURL(/\/post$/);

await toast(page, "Post created").dismiss();
await expectAccessible(page);
```

To check a flash message, wait for its toast text. Close the toast with `toast(page, text).dismiss()` before you call `expectAccessible()`.

```ts
await button(page, "Delete My post").click();
const confirm = dialog(page, "Delete post?");
await expectAccessible(page);
await button(confirm, "Delete").click();
```

`expectAccessible()` waits for the opening animation of the dialog.

## See also

- [Actions](./actions.md)
- [API (tRPC)](./api.md)
- [Full-text search](./search.md)
- [Validation](./validation.md)
- [Realtime](./realtime.md)
- [Auth](./auth.md)
- [Testing](./testing.md)
- [Notifications](./notifications.md#the-bell)
- [SEO](./seo.md)
- [Soft deletes](./soft-deletes.md)
- [Maintenance mode](./maintenance.md)
