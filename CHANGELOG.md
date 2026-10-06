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
- `$api` is the typed API of the app, the client that `useTRPC()` returns.
  It is auto-imported in the app and usable in templates.
- Every query procedure of `$api` has `.useQuery(input, options?)`: it
  runs `useQuery()` and returns its result wrapped in `reactive()`.
- The `query` function of `queryOptions()` passes the abort signal of
  Pinia Colada to tRPC, so a cancelled query cancels its request.
- Every mutation procedure of `$api` has `.useMutation(options?)`: it
  runs `useMutation()` and returns its result wrapped in `reactive()`.
- The pages and the form that `make:resource --ui` writes read the API
  through `$api` and `.useQuery()`, in place of `useTRPC()`.
- `nuxvel upgrade --only use-trpc` replaces `useTRPC()` with `$api`: a
  `const` bound to `useTRPC()` goes, and each use of it becomes `$api`.
