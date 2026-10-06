# App (`app/`)

Auto-imported: composables, components, `shared/schemas/*`, `RouterInputs`, `RouterOutputs`. Nuxt UI `U*` components are on.

## Page with a query and a form

```vue
<script setup lang="ts">
definePageMeta({ middleware: "auth" });
const queryCache = useQueryCache();
const { ts, localeRoute } = useI18n();
const posts = $api.post.list.useQuery({ page: 1 });
const form = useActionForm(createPostInput, $api.post.create.mutationOptions(), {
  defaults: { title: "", body: "" },
  failures: { "post.locked": "title" },
  onSuccess: async () => {
    queryCache.invalidateQueries({ key: $api.post.key() });
    await navigateTo(localeRoute({ name: "post" }));
  },
});
useSeo(() => ({ title: ts("post.title") }));
</script>

<template>
  <QueryState :query="posts">
    <template #empty><UEmpty :title="$ts('post.empty')" /></template>
    <template #default="{ data }">…</template>
  </QueryState>
  <UForm :ref="form.ref" :schema="form.schema" :state="form.state" @submit="form.submit">
    <UFormField name="title" :label="$ts('post.fields.title')"><UInput v-model="form.state.title" /></UFormField>
    <UAlert v-if="form.formError" color="error" :title="form.formError" />
    <UButton type="submit" :loading="form.pending" :label="$ts('post.create')" />
  </UForm>
</template>
```

## Data

| Name | Use |
|---|---|
| `$api` | typed API, also in templates. `$api.post.list.useQuery(input \| () => input, options?)` (cached query, Pinia Colada, no `.value`), `$api.post.create.useMutation(options?)` (`{ mutate, error, … }`), `.key()`, `.queryOptions(input)`, `.mutationOptions()`. One-off: `await $api.post.list.query()` |
| `useQuery(options \| () => options)` | Pinia Colada's own query, for `queryOptions()` |
| `useMutation(options)` | Pinia Colada's own mutation, for `mutationOptions()` |
| `useQueryCache()` | `invalidateQueries({ key })`, `setQueriesData` |
| `optimistic(mutationOptions, { key, apply })` | change the cache first, roll back on error |
| `useLiveQuery(options, { channel, on \| refetch })` | query patched by channel events |
| `useActionForm(schema, mutationOptions, { defaults, onSuccess, failures, warnUnsaved })` | `form.ref/schema/state/submit/errors/formError/pending` |
| `RouterOutputs["post"]["byId"]` | procedure type, never hand-written |

SSR: `NOT_FOUND`/`FORBIDDEN`/`UNAUTHORIZED` render the `error` slot with 404/403/401. `ssrCatchError: true` on a query for expected errors.

## User, UI, realtime

| Name | Use |
|---|---|
| `useUser()` | `{ user, isPending, signOut, signInWith }`. Sign out only with `signOut()` |
| `useConfirm()` | `await confirm({ title, description, confirmLabel, color })` → boolean |
| `toasted(mutationOptions, "Saved")` | success toast |
| `useFlash()` | reads a server `flash()` |
| `useChannel("posts", { limit })` | `{ events, status, close }` |
| `usePresence("posts", { id })` | `{ members, setState }` |
| `useJobChannel("post.import")` | `{ events }` of a job with `channel` |
| `useUpload("post-cover")` | `{ upload, uploading, progress }` |
| `useFlag("new-editor")`, `useExperiment("subscribe-button")` | flag, variant |
| `useNotifications()` | the database notifications |
| `useSeo({ title, description })` | head tags. Getter for loaded data |
| `isNetworkError(error)` | server not reached |

## Components

| Component | Use |
|---|---|
| `<QueryState :query>` | slots `loading`, `error { error, retry }`, `empty`, `default { data }` |
| `<DataTable :query :columns :list search>` | paginated `UTable`. Page, sort, filters in the URL. Cell slot `#<column>-cell="{ row }"` |
| `<SearchInput v-model>` | search box for a list |
| `<UploadField v-model name field label accept>` | upload in a `UForm` |
| `<SafeHtml :html>` | sanitized user HTML |
| `<DateTime :value relative?>` | same text on server and browser |
| `<AuthForm>`, `<SocialSignIn>`, `<NotificationBell>`, `<PresenceAvatars :members>`, `<TypingIndicator>`, `<MaintenanceBanner>` | ready-made UI |

## Pages and links

- `app/pages/post/[id].vue` → route `post-id`. `useRoute("post-id").params.id` is typed.
- `navigateTo(localeRoute({ name: "post-id", params: { id } }))` with `localeRoute` from `useI18n()`. `<UButton :to="$localeRoute({ name: 'post' })">`. See [i18n.md](i18n.md).
- Auth: `definePageMeta({ middleware: "auth" })`. Layouts: `home`, `default`, `app`, `auth`.
- Rendering presets in `nuxt.config.ts` `nuxvel.rendering`: `cached`, `private` (user data), `client`.
