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
- `can()`, `authorize()` and `canMany()` take no actor: they read the
  actor of the running procedure, action, job or seeder, and the guest
  in a signed-out request. Outside a request with no actor they throw.
  By hand: write `authorize("update", postTable, post)` in place of
  `authorize(ctx.actor, "update", postTable, post)`, and the same for
  `can()` and `canMany()`. A check as another actor, such as
  `can(systemActor("cleanup"), ...)`, moves into an action called with
  `{ actor }`. Codemod: `actor-arg` (it removes `ctx.actor` and `actor`,
  and prints any other actor as a manual step).
- `SYSTEM_ACTOR_TYPE`, `API_KEY_ACTOR_TYPE` and the server `auth()` are
  no longer auto-imported. By hand: write `"system"` and `"api-key"` in
  place of the constants, and `(await useAuth()).user` in place of
  `(await auth())?.user`. Where the code reads more than `.user`, such
  as `session.expiresAt`, call `requireAuth()`, which throws when signed
  out. Codemod: `removed-globals` (it rewrites the
  constants and each `auth()` whose result is only read for `.user`, and
  prints any other `auth()` as a manual step).
- An actor built by hand as `{ type: "user", id }` has no `userId`, so
  a rule that compares `actor.userId`, such as the ownership rule that
  `make:router --crud` writes, denies it. By hand: build the actor with
  `userActor(user)`, which sets `userId`. No codemod.
- `dispatchAfterCommit()`, `broadcast()`, `broadcastAfterCommit()`,
  `sendMail()`, `emit()` and `notify()` are removed: call the method of
  the definition, through its `$kind` namespace. By hand: write
  `$jobs.post.notifyFollowers.dispatch(input, options)` in place of
  `dispatchAfterCommit("post.notify-followers", input, options)`,
  `$channels.posts.broadcast("created", payload, params)` in place of
  `broadcast("posts", "created", payload, params)` and of
  `broadcastAfterCommit(...)`, `$mails.welcome.send(input, options)` in
  place of `sendMail("welcome", input, options)`,
  `$events.post.published.emit(payload)` in place of
  `emit("post.published", payload)`, and
  `$notifications.welcome.notify(userId, data)` in place of
  `notify(userId, "welcome", data)`. A call that passed a definition,
  such as `emit(postPublishedEvent, payload)`, becomes
  `postPublishedEvent.emit(payload)`. A `broadcast()` inside a
  transaction now waits for the commit, as `broadcastAfterCommit()` did.
  Outside one it still sends at once. `sendMailNow()` stays. Codemod:
  `definition-methods` (it maps a string name to its `$` path, and
  prints a name it cannot map, such as a variable, as a manual step).

### Changes

- `belongsTo(table, { column, onDelete, nullable })` of `@nuxvel/nuxt/database`
  writes a foreign key column to the `id` of `table`, with the same SQL as
  the hand-written `.references()`.
- A factory creates the missing parent row of a `NOT NULL` foreign key
  column with the factory of the parent table, and takes a parent by its
  relation name: `postFactory({ author })` sets `authorId`. A definition
  line such as `authorId: async () => (await userFactory()).id` can go.
  A `NOT NULL` foreign key with no value in a factory now creates a parent
  row, so a test that expected a foreign key error, or that counts the rows
  of the parent table, can change.
- `defineUserData(table)` without a column uses the one column of `table`
  that references the user table, such as `belongsTo(userTable)`.
- New apps write their foreign keys to the user and session tables with
  `belongsTo()`. An existing app keeps its `.references()` columns, or
  changes them to `belongsTo()` with no migration.
- `make:schema`, `make:router --crud` and `make:resource` write each
  reference and the `ownerId` column with `belongsTo()`.
- `nuxvel test:arch` reports a `belongsTo(userTable)` column with no
  `defineUserData()`, as it does a hand-written reference to `userTable.id`.
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
- `findAuthorized(table, id, action)` loads a row and authorizes an
  action on it for the current actor, throwing `NotFoundError` or
  `ForbiddenError`. It replaces `findOrFail()` followed by
  `authorize()`. The actions that `make:router --crud` writes call it.
- `insertOne(table, values)` and `updateOne(table, id, values)` write one
  row and return it. `updateOne` throws `NotFoundError` when no row has
  that `id`. Both join the ambient transaction. The actions that
  `make:router --crud` writes use them.
- `nuxvel test:arch` reports `insertOne()` and `updateOne()` in a router
  or a route, as it reports `useDb().insert()`, and in app code that
  writes the billing tables.
- `softDelete()`, `restore()` and `forceDelete()` also take an `id`: they
  return the row, or throw `NotFoundError` when no row that they can
  change has that `id`. The `where` form is unchanged.
- `withAbilities(schema, refs)` extends a row schema for `.output()` with
  `can`, such as `{ update: true, delete: false }`, for the caller. It
  works for one row and inside `paginated()`, with one `canMany()` call
  for the rows of a response. It replaces a separate `abilities`
  procedure.
- `userActor()` sets `userId` to the user's id, so `actor.userId` is the
  user behind a user actor and an API key alike. Code that wrote
  `actor.userId ?? actor.id` can write `actor.userId`. The code that
  `make:router --crud` writes does, so build an actor for it with
  `userActor(user)`, not by hand as `{ type: "user", id }`.
- An action, `audit()`, `can()` and `authorize()` called with no actor
  throw an error that names the action or the call, and the fix, in
  place of `defineAction: actor is required` and `audit: no actor in
  context`.
- A request signed with an API key looks the key up once, however many
  procedures of a batch, `can()` or `authorize()` calls read it. Each
  procedure call still spends the key's `api-key` rate limit.
- `userActor()` and `apiKeyActor()` return `Actor & { userId: string }`,
  and so does `ctx.actor` of `authedProcedure`, `roleProcedure`,
  `adminProcedure` and `freshProcedure`: `ctx.actor.userId` is a
  `string` there. In an action it stays optional, as a job or a seeder
  can call it with a system actor.
- Each job, channel, mail, event and notification has a method, reached
  through its `$kind` namespace: `$jobs.post.notifyFollowers.dispatch(input,
  options?)`, `$channels.posts.broadcast(event, payload, params?)`,
  `$mails.welcome.send(input, options?)`, `$events.post.published.emit(payload)`
  and `$notifications.welcome.notify(userIds, data)`. Inside a transaction,
  each one waits for the commit and does nothing after a rollback.
  `nuxvel events` and `nuxvel test:arch` read `emit()` called as a method.
- A definition is named on the first read of its registry or at boot,
  so a definition file whose imports reach its own registry, such as a
  job that dispatches another job through `$jobs`, no longer stops the
  server with `Cannot access ... before initialization`.
- `useLogger()` without a tag tags its lines with the name of the
  running action or job.
- A `defineSeeder()` handler may return lines (`string[]`), which
  `nuxvel db:seed` and `nuxvel db:fresh --seed` print under its name.
  `make:seeder` writes a seeder that returns `[]`.
