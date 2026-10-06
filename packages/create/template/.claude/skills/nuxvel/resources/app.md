# App (`app/`)

Auto-imported: composables, components, `shared/schemas/*`, `RouterInputs`, `RouterOutputs`. Nuxt UI `U*` components are on.

## Page with a query and a form

```vue
<script setup lang="ts">
definePageMeta({ middleware: "auth" });
const { ts, localeRoute } = useI18n();
const posts = $api.post.list.useQuery({ page: 1 });
useSeo(() => ({ title: ts("post.title") }));
</script>

<template>
  <QueryState :query="posts">
    <template #empty><UEmpty :title="$ts('post.empty')" /></template>
    <template #default="{ data }">…</template>
  </QueryState>
  <ActionForm
    :action="$api.post.create"
    :defaults="{ body: '' }"
    :submit-label="$ts('post.create')"
    :options="{ toast: 'Post created', onSuccess: () => navigateTo(localeRoute({ name: 'post' })) }"
  />
</template>
```

`<ActionForm>` renders one field per key of the input schema: string `UInput` (typed for `z.email()`/`z.url()`), enum `USelect`, boolean `USwitch`, number `UInputNumber`, date `UInputDate`, `richText()` `UTextarea`, `.meta({ upload: "<name>" })` `<UploadField>`, `.meta({ input: "textarea" })` `UTextarea`. Label: i18n key `post.create.fields.<name>`, else the humanized name. Go down a step only when needed:

| Step | Write |
|---|---|
| Props | `:fields="{ title: { label, placeholder, hint } }"`, `hidden="id"`, `submit-label`, `:options` (toast, onSuccess, failures, ...), `class`, `:ui="{ root, field, actions }"` |
| One input | `<template #field-role="{ field }"><URadioGroup v-model="field.value" :items /></template>` (an array of objects or a union needs one) |
| Layout | default slot with `<ActionField name="street" />` anywhere, `<template #actions="{ pending }">` |
| App-wide | `app.config.ts` `ui: { actionForm: { slots: { root, field, actions } } }`. `nuxt.config.ts` `nuxvel: { form: { inputs: { date: "MyDatePicker", money: "MoneyInput" } } }` with `z.number().meta({ input: "money" })` |
| Own markup | `useActionForm()` with your own `<UForm>`, below |

A delete button asks, removes the row at once and puts it back on error:

```ts
const input = computed(() => paginationSchema.catch({}).parse(useRoute().query));
const remove = $api.post.delete.useMutation({
  toast: "Post deleted",
  confirm: { title: "Delete post?", confirmLabel: "Delete", color: "error" },
  optimistic: { key: () => $api.post.list.key(input.value), apply: removeRow() },
});
```

## Data

| Name | Use |
|---|---|
| `$api` | typed API, also in templates. `$api.post.list.useQuery(input \| () => input, options?)` (cached query, Pinia Colada, no `.value`), `$api.post.create.useMutation(options?)` (`{ mutate, error, … }`), `.key()`, `.queryOptions(input)`, `.mutationOptions()`. One-off: `await $api.post.list.query()` |
| `useQuery(options \| () => options)` | Pinia Colada's own query, for `queryOptions()` |
| `useMutation(options)` | Pinia Colada's own mutation, for `mutationOptions()` |
| `useQueryCache()` | `setQueriesData`, `invalidateQueries({ key })` for a refetch no mutation causes. A mutation already refetches its router's queries and the tags its actions declare in `invalidates` |
| `{ optimistic: { key, apply } }` in `.useMutation()` or `.mutationOptions()` | change the cache first, roll back on error. `apply` can be `removeRow()`, `prependRow()` or `replaceRow()` on a paginated list |
| `useLiveQuery(options, { channel, on \| refetch })` | query patched by channel events |
| `useActionForm($api.post.create, { defaults, onSuccess, failures, warnUnsaved, schema, toast, confirm, invalidate })` | `form.ref/schema/state/submit/errors/formError/pending`. Schema: the procedure's input from `shared/schemas/` (else pass `schema`). `defaults` is partial: `defaults: props.post` keeps the schema's keys, a missing key starts at its `.default()` or `undefined`. A failure with `field` on the action shows under that field; `failures: { code: "field" }` overrides |
| `RouterOutputs["post"]["byId"]` | procedure type, never hand-written |

SSR: `NOT_FOUND`/`FORBIDDEN`/`UNAUTHORIZED` render the `error` slot with 404/403/401. `ssrCatchError: true` on a query for expected errors.

## User, UI, realtime

| Name | Use |
|---|---|
| `useUser()` | `{ user, isPending, signOut, signInWith }`. Sign out only with `signOut()` |
| `{ confirm: { title, confirmLabel, color } }` in `.useMutation()` or `.mutationOptions()` | dialog before the mutation runs |
| `useConfirm()` | `await confirm({ title, description, confirmLabel, color })` → boolean, to ask in your own code |
| `{ toast: "Saved" }` in `.useMutation()` or `.mutationOptions()` | success toast |
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
| `<ActionForm :action :defaults>`, `<ActionField name>` | form from the input schema, see above |
| `<UploadField v-model name field label accept>` | upload in a `UForm` |
| `<SafeHtml :html>` | sanitized user HTML |
| `<DateTime :value relative?>` | same text on server and browser |
| `<AuthForm>`, `<SocialSignIn>`, `<NotificationBell>`, `<PresenceAvatars :members>`, `<TypingIndicator>`, `<MaintenanceBanner>` | ready-made UI |

## Pages and links

- `app/pages/post/[id].vue` → route `post-id`. `useRoute("post-id").params.id` is typed.
- `navigateTo(localeRoute({ name: "post-id", params: { id } }))` with `localeRoute` from `useI18n()`. `<UButton :to="$localeRoute({ name: 'post' })">`. See [i18n.md](i18n.md).
- Auth: `definePageMeta({ middleware: "auth" })`. Layouts: `home`, `default`, `app`, `auth`.
- Rendering presets in `nuxt.config.ts` `nuxvel.rendering`: `cached`, `private` (user data), `client`.
