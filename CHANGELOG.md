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
  what the response names and the namespace. `useActionForm()`,
  `toasted()` and `optimistic()` keep it.
