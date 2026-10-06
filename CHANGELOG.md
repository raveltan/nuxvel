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
- A router or procedure named `useQuery` fails `nuxt typecheck`, as
  `$api` reserves the name. Rename it.

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
