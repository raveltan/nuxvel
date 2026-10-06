# Changelog

Upgrade an app with `npm update @nuxvel/nuxt @nuxvel/cli`. A release
that needs more from the app lists the steps under **Upgrade**.

## Unreleased

After `npm update @nuxvel/nuxt @nuxvel/cli`, run `npx nuxvel upgrade`: it
applies each step below that names a codemod.

### Upgrade

- Tests can import `#nuxvel/schema`, `#nuxvel/factories`, `#server/*`
  and `#shared/*`. Add them to the `imports` of `package.json`, after
  `#nuxvel/test-namespaces`:
  ```json
  "#nuxvel/schema": "./.nuxt/nuxvel/schema.ts",
  "#nuxvel/factories": "./.nuxt/nuxvel/factories.ts",
  "#server/*": "./server/*",
  "#shared/*": "./shared/*"
  ```
  Codemod: `test-aliases`.
- `nuxvel test:arch` reports `../` imports between kind folders, and an
  import of `shared/schemas/` in `app/` and `server/`, which auto-import
  it (the rule `nuxvel/no-parent-imports`, now in the `architecture`
  preset). By hand: import tables from `#nuxvel/schema`, factories from
  `#nuxvel/factories`, other server code from `#server/<path>`, `shared/`
  from `#shared/<path>` and `app/` from `~/<path>`, and delete the imports
  of `shared/schemas/` from `app/` and `server/`. `npx eslint --fix` with
  the preset does the same. Codemod: `imports`.
- A router or procedure named `useQuery` or `useMutation` fails `nuxt
  typecheck`, as `$api` reserves these names. Rename it.
- `useTRPC()` is removed, use the auto-imported `$api`: it is the same
  client, and also works in templates. By hand: delete `const trpc =
  useTRPC();` and write `$api` where the code used `trpc`, replace
  `useTRPC()` by `$api` elsewhere, and change `ReturnType<typeof
  useTRPC>` to `typeof $api`. Write `$api.<path>.useQuery(input)` in
  place of `useQuery($api.<path>.queryOptions(input))`, and drop the
  `.value` after its `data`, `error` and `state`. A
  `mockNuxtImport("useTRPC", ...)` has no replacement: `$api` reads
  `useNuxtApp().$trpc`, so mock that. Codemod: `use-trpc`.
- Optional cleanup: a mutation invalidates the queries of its own
  namespace, so a hand-written `queryCache.invalidateQueries({ key:
  $api.post.key() })` in the `onSuccess` of `$api.post.update` is
  redundant. It still works and fetches nothing twice. By hand: delete
  it, and the `useQueryCache()` it leaves unused. Keep one for another
  namespace, and keep them all when the app sets
  `nuxvel.api.invalidateFallback: false`. Codemod: `invalidate`.
- `toasted()` and `optimistic()` are removed: they are options of
  `$api.<path>.useMutation()` and `.mutationOptions()`. By hand: write
  `$api.post.update.mutationOptions({ toast: "Saved" })` in place of
  `toasted($api.post.update.mutationOptions(), "Saved")`, and
  `$api.post.delete.useMutation({ optimistic: { key, apply } })` in place
  of `useMutation(optimistic($api.post.delete.mutationOptions(), { key,
  apply }))`. An `onMutate` or `onSettled` beside `optimistic` now runs
  after it instead of being dropped. The type `OptimisticUpdate` stays.
  Codemod: `mutation-options`.
- The `audited()` tRPC middleware is removed: the `audit` option of
  `defineAction()` writes the same row. By hand: delete
  `.use(audited("post.updated", { target: postTable }))` from the
  procedure and add `audit: { name: "post.updated", target: postTable }`
  to the action it calls, importing `postTable` there. A procedure
  that calls no action writes the row with `await audit("post.updated",
  { type: getTableName(postTable), id: input.id })` in its handler.
  Codemod: `audit`.
- `useActionForm(schema, mutationOptions, options)` is removed: it takes
  the mutation of `$api` and one options object, and finds the input
  schema in `shared/schemas/`. By hand: write
  `useActionForm($api.post.update, { toast: "Saved", defaults, onSuccess })`
  in place of `useActionForm(updatePostInput,
  $api.post.update.mutationOptions({ toast: "Saved" }), { defaults,
  onSuccess })`. Move an `onSuccess` of `.mutationOptions()` into the
  `onSuccess` of the form. A procedure whose input schema is not a named
  export of `shared/schemas/` does not compile: move the schema there,
  or pass it as `schema`. A form of another client, such as Better Auth,
  calls the client in a `<UForm>` of its own. Codemod: `action-form`.
- `nuxvel test:arch` reports an `.action()` without `.output()` before
  it, and an action with `procedure` and no `output`, in the rule
  `nuxvel/router-output`. By hand: add `.output(schema)` before
  `.action()`, and `output: schema` to the action, listing only the
  fields the browser may see.

### Changes

- Generated files import tables from `#nuxvel/schema`, factories from
  `#nuxvel/factories` and other server code from `#server/<path>`, in place
  of relative paths.
- `nuxvel factory:sync` finds the table of a factory that imports it from
  `#nuxvel/schema`.
- `nuxvel upgrade` applies the codemods of the installed nuxvel;
  `--dry-run` prints them as a diff and `--only <codemod>` runs one.
- The ESLint rule `nuxvel/no-parent-imports` reports a `../` import into
  another kind folder and fixes it to `#nuxvel/schema`, `#nuxvel/factories`,
  `#server/*`, `#shared/*`, `~/*` or `#layers/<name>/*`.
- The codemod `imports` of `nuxvel upgrade` rewrites each `../` import
  into another kind folder to its alias, as `nuxvel/no-parent-imports`
  fixes it.
- `nuxvel/no-parent-imports` reports an import of `shared/schemas/` in
  `app/` and `server/`, whose exports are auto-imported there, and removes
  it; so does the codemod `imports`. Generated actions and routers no
  longer import their schemas.
- `<QueryState>` and `<DataTable>` accept a `useQuery()` result wrapped
  in `reactive()`.
- `$api` is the typed API of the app, the client of `$trpc`.
  It is auto-imported in the app and usable in templates.
- Every query procedure of `$api` has `.useQuery(input, options?)`: it
  runs `useQuery()` and returns its result wrapped in `reactive()`.
- The `query` function of `queryOptions()` passes the abort signal of
  Pinia Colada to tRPC, so a cancelled query cancels its request.
- Every mutation procedure of `$api` has `.useMutation(options?)`: it
  runs `useMutation()` and returns its result wrapped in `reactive()`.
- The pages and the form that `make:resource --ui` writes read the API
  through `$api` and `.useQuery()`, in place of `useTRPC()`.
- The new page and the form that `make:resource --ui` writes no longer
  invalidate the queries of the resource: the client does it after the
  mutation.
- `nuxvel upgrade --only use-trpc` replaces `useTRPC()` with `$api`: a
  `const` bound to `useTRPC()` goes, and each use of it becomes `$api`.
  It also turns `useQuery($api.<path>.queryOptions(input))` into
  `$api.<path>.useQuery(input)`, and `useMutation($api.<path>.mutationOptions())`
  into `$api.<path>.useMutation()`, when every use of the result reads `.value`.
- `remember()`, `cachePut()`, `cacheGet()`, `cacheForget()` and the cache
  assertions of `@nuxvel/nuxt/testing` take a key array such as
  `["posts", "list", input]`: the parts are joined with `:`, and an
  object part is JSON with sorted keys. `cacheForget(["posts"])` also
  forgets every key under `posts:`.
- An action's `invalidates` takes tags: strings or key arrays, each
  forgotten with every cache key under it (`"posts"` also forgets
  `posts:list`), or a function `(output, input) => tags`. A string with
  `*`, `?` or `[` stays a glob. A plain string such as `"posts:list"`,
  which forgot that one key, now also forgets the keys under it.
- A tRPC mutation response carries the header `x-nuxvel-invalidates`:
  the tags its actions' `invalidates` declared and committed, as
  URL-encoded JSON arrays (`"posts:*"` is sent as `["posts"]`).
- The tRPC client sends every mutation in a request of its own, not in
  a batch; queries are still batched. A test that mocks a mutation with
  `registerEndpoint()` answers with one result object, not an array.
- After a mutation succeeds, the client of `$api` invalidates the
  queries under each tag that its response names, and under the
  mutation's router namespace (`post.delete` invalidates `$api.post`),
  after the mutation's `onSuccess` and `onSettled`. An
  `invalidateQueries()` written by hand still works and fetches no query
  twice; it can go.
- `nuxvel.api.invalidateFallback: false` stops a mutation from
  invalidating the queries of its router namespace in the client: it
  invalidates only the tags its response names. The default is
  `"namespace"`.
- `.useMutation()` and `.mutationOptions()` of `$api` take `invalidate`:
  tags, a function `(result, input) => tags`, or `false`, in place of
  what the response names and the namespace. `useActionForm()` keeps
  it.
- `.useMutation()` and `.mutationOptions()` of `$api` take `optimistic:
  { key, apply }`, which patches a cached query before the mutation
  runs. `.mutationOptions()` also takes Pinia
  Colada's callbacks, and every `onMutate`, `onError` and `onSettled`
  runs after nuxvel's.
- `.useMutation()` and `.mutationOptions()` of `$api` take `toast`: a
  title, Nuxt UI toast props, or a function of the result, shown as a
  success toast.
- `.useMutation()` and `.mutationOptions()` of `$api` take `confirm`:
  the options of `useConfirm()`, or a function of the input that returns
  them. The dialog opens before the mutation runs. A cancel runs
  nothing, keeps `status` and `error`, and rejects `mutateAsync()` with
  a `MutationCancelledError`. `useActionForm()` ignores it.
- `nuxvel upgrade --only mutation-options` moves `toasted()` and
  `optimistic()` into the `toast` and `optimistic` options, and turns
  `useMutation()` of those options into `.useMutation()`.
- The list page that `make:resource --ui` writes deletes through
  `.useMutation()` with `optimistic`, `removeRow()` and `confirm`.
- `allowGuest(rule)` lets the guest actor of a signed-out caller reach
  a policy rule. Every other rule denies it. An action's `rateLimit`
  with `by: "user"` counts the guest by its IP.
- `defineAction()` takes `output`: the schema of what its mounted
  procedure sends. A field it does not list never reaches the client.
- `defineAction()` takes `procedure`: `"public"`, `"authed"`, `"admin"`
  or a procedure builder. The action is then a mutation at its path
  (`posts.updatePost` for `server/actions/posts/update-post.action.ts`),
  typed on `$api`, with no router. A router key at the same path fails
  the build. `nuxvel routes` lists it with the action file.
- Every procedure builder has `.action(action)`: a mutation that runs
  the action, with its input and output, as the caller (a signed-out
  caller as the actor `{ type: "guest", id: "guest" }`).
- Every procedure builder has `.openapi({ path?, summary?, tags?,
  protect? })`: the method is `GET` for a query and `POST` for a
  mutation, the path defaults to the procedure path and the tag to its
  router. `.meta({ openapi })` still works.
- `nuxvel upgrade --only audit` moves `audited()` to the `audit` option
  of the action that the mutation calls, or to `audit()` in a handler
  that calls no action.
- `defineAction()` takes `audit`: a name such as `"post.created"`, which
  audits the row the handler returns, or `{ name, target }`, which
  audits the row with the id `input.id` and the columns that changed.
- `input` is optional on `defineAction()` and `defineJob()`. Without
  it, the action or job takes `{}` or `undefined`.
- `removeRow()`, `prependRow()` and `replaceRow()` are auto-imported
  patches for a page of `paginated()` data, for `useLiveQuery()` and
  optimistic updates. They keep `total` and `lastPage` right and skip a
  duplicate row.
- An action's `errors` takes `{ message, field }` for a failure that
  belongs to one input field: the procedure also sends the message in
  `data.fields`, and `useActionForm()` shows it under that field. The
  `failures` option of `useActionForm()` wins over it.
- `useActionForm($api.<path>, options?)` takes its schema from the
  generated `#nuxvel/procedure-inputs`, and passes `toast`, `confirm`,
  `invalidate`, `optimistic` and Pinia Colada's callbacks to the
  mutation. `defaults` is partial: it keeps only the keys of the schema,
  and a key it leaves out starts at the schema's `.default()` or
  `undefined`. `schema` replaces the procedure's schema.
- `nuxvel upgrade --only action-form` rewrites
  `useActionForm(schema, $api.<path>.mutationOptions(options), formOptions)`
  to `useActionForm($api.<path>, { ...options, ...formOptions })`.
- The forms that `make:resource --ui` writes pass the `$api` mutation to
  `useActionForm()`.
- `<ActionForm :action="$api.<path>" :defaults>` renders a field for
  each key of the procedure's input schema, with the input of its type,
  and keeps the behaviour of `useActionForm()`. It takes `fields`
  (label, placeholder, hint), `submit-label`, `hidden`, `options` (the
  options of `useActionForm()`), `class` and `ui`, a `#field-<name>`
  slot, a default slot with `<ActionField name>` for the layout, and
  `#actions="{ pending }"`. `app.config.ts` `ui.actionForm.slots` styles
  every form. `.meta({ input: "textarea" })` and `.meta({ upload })` on
  a shared schema field pick its input. A label comes from the
  translation `<action path>.fields.<name>`, else from the field name.
- `nuxvel.form.inputs: { date: "MyDatePicker", money: "MoneyInput" }`
  names the component of the app that `<ActionForm>` renders for a kind
  of input: a default kind, or a kind that a schema field names with
  `.meta({ input })`.
- `toHaveValidationErrors` passes for an action failure with a `field`.
- `nuxvel test:arch` and the `architecture` preset report an import of
  server code under `shared/` (`server/`, `#server/*`, `#nuxvel/*`,
  `drizzle-orm`, `@nuxvel/nuxt/database`), in the rule
  `nuxvel/shared-imports`.
- `make:action` writes an action without `input` when you give no fields,
  and `make:router --crud` writes `.openapi()` for `GET` and `POST`
  procedures and mutations that do not pass the actor.
