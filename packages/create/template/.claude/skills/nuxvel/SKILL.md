---
name: nuxvel
description: The API and the rules of this nuxvel app (Nuxt, Drizzle, tRPC, Zod, Better Auth). Use it before you add or change a table, action, router, policy, job, event, mail, channel, flag, page, form, translation or test.
---

# nuxvel app

Nuxt 4 + `@nuxvel/nuxt`. Data: Drizzle on Postgres. API: tRPC. Input: Zod. Auth: Better Auth. CLI: `./nv <command>`.

## Rules

1. Write data only in an action. A router, route, job or page calls an action. It never calls `useDb().insert()`, `.update()` or `.delete()`.
2. An action never reads the request. It gets the actor in `ctx.actor`.
3. Each `.query()` and `.mutation()` has `.output(schema)`. No result: `.output(z.void())`.
4. An action in a procedure runs as the caller: no `{ actor: ctx.actor }`. Pass `ctx.actor` to policies. Do not build an actor in a procedure.
5. Do not import an auto-imported name. Import tables, actions, `drizzle-orm` operators and test fixtures.
6. Links use route names in the current locale: `:to="$localeRoute({ name: 'post-id', params: { id } })"`. Never `"/post/1"`.
7. No `v-html`. Use `<SafeHtml :html>`.
8. A table with a column to the user table needs `defineUserData()` in `server/privacy/`.
9. No `!` to remove `undefined`. Use `firstOrFail`.
10. Make a new file with `./nv make:*`. It writes the file, the export name and a test.
11. `shared/` runs in the browser. It never imports `drizzle-orm`, `#nuxvel/*` or `server/`.
12. Before you finish: run the changed tests, `./nv test:arch`, `npm run typecheck`.

## Resources

Read only the file that the task needs.

| Task | Read |
|---|---|
| Run a command, generate a file, field syntax | [resources/cli.md](resources/cli.md) |
| Where a file goes, its export, its name | [resources/files.md](resources/files.md) |
| Table, schema, action, router, policy, error, query | [resources/server.md](resources/server.md) |
| Event, job, schedule, mail, notification, channel, upload, webhook, flag, cache | [resources/background.md](resources/background.md) |
| Page, form, query, table, realtime in the browser | [resources/app.md](resources/app.md) |
| Functional, component or end-to-end test, factory | [resources/testing.md](resources/testing.md) |
| Text on a page, translation, locale, link in a locale | [resources/i18n.md](resources/i18n.md) |

Full guides: https://github.com/raveltan/nuxvel/blob/main/docs/index.md
