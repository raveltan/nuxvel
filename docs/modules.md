# Modules

## Introduction

A module keeps one part of a large app apart from the other parts, as in a modular monolith. In nuxvel, a module is a [Nuxt layer](https://nuxt.com/docs/guide/going-further/layers) in `layers/<name>/`. Nuxt extends each folder in `layers/` automatically, and nuxvel discovers the server files of each layer as it does for the app. A module thus needs no registration and no barrel file.

## Creating a module

A module is a folder in `layers/` with a `nuxt.config.ts`. Nuxt skips a folder without this file. An empty config is sufficient:

```ts
// layers/billing/nuxt.config.ts
export default defineNuxtConfig({});
```

`nuxvel make:module billing` writes this file. See [`nuxvel make:module`](./cli.md#nuxvel-makemodule-name).

Each module gets the alias `#layers/<name>`, for example `#layers/billing`.

To write a file into a module, give `--module <name>` to a `make:*` command. `nuxvel make:job charge-card --module billing --domain invoice` writes `layers/billing/server/domains/invoice/jobs/charge-card.job.ts` and its test. `make:page invoices --module billing` writes `layers/billing/app/pages/invoices.vue`. See [Generators](./cli.md#names).

## Layout inside a module

A module has the same folders as the app: `app/`, `server/` and `shared/`. In `server/`, use the kind folders, or use [domain folders](./auto-imports.md#domain-folders). A module is a layer, and a domain folder groups the files of one domain in a layer. A module can thus hold one or more domains:

```
layers/billing/
  nuxt.config.ts
  app/pages/billing/index.vue
  shared/schemas/invoice.ts
  server/domains/invoice/
    actions/send-invoice.action.ts      # action "invoice.send-invoice"
    actions/send-invoice.action.test.ts
    jobs/charge-card.job.ts             # job "invoice.charge-card", $jobs.invoice.chargeCard
    policies/invoice.policy.ts          # $policies.invoice
    routers/invoice.router.ts           # tRPC namespace invoice
    schema/invoices.schema.ts           # invoicesTable
    factories/invoices.factory.ts       # invoicesFactory
```

The folder name of the module is not part of a name. A name comes from the path in `server/`, as in the app. The `$jobs`, `$policies` and other namespaces, `#nuxvel/schema` and `#nuxvel/factories` include the files of each module. `nuxvel test:arch` checks the files of each module with the same rules as the app. In the `architecture` preset of `@nuxvel/nuxt/eslint`, the rule `nuxvel/user-data-declared` also checks the tables of each module.

## Names

Two files in two modules must not give the same name. This applies to the files in kind folders and in domain folders, and to tRPC namespaces and policies. For example, `layers/billing/server/jobs/invoice/charge.job.ts` and `layers/shop/server/domains/invoice/jobs/charge.job.ts` both give the job name `invoice.charge`, and the build stops with an error that names the two files. Give each name in a module a first word that no other module uses, for example the domain name.

A file in the app hides a file with the same name in a module. A file in an npm layer that the app extends does not clash with a file in a module. The file in the higher layer hides the other file, as in Nuxt.

## Database tables

`#nuxvel/schema` includes the tables of each module. `nuxvel db:generate` reads only the schema paths in `drizzle.config.ts`. The `drizzle.config.ts` of a new app lists `./layers/*/server/database/schema/**/*.ts` and `./layers/*/server/domains/*/schema/**/*.schema.ts`, so `nuxvel db:generate` sees the tables of each module. Keep these globs when you edit the file. Migrations of all modules go into the one `server/database/migrations/` folder of the app.

## Boundaries

A module imports another module only from its `shared/` folder. The rule `nuxvel/module-imports` of [`nuxvel test:arch`](./cli.md#nuxvel-testarch) reports each import from `layers/<a>/` into `layers/<b>/` outside `layers/<b>/shared/`. The rule checks relative paths, `#layers/<b>/...`, `~~/layers/<b>/...` and `@@/layers/<b>/...`:

```ts
// layers/shop/server/utils/checkout.ts
import { money } from "#layers/billing/shared/money";
import { invoiceTotal } from "#layers/billing/server/utils/total"; // reported
```

The rule sees explicit imports only. Auto-imports and the `$` namespaces, such as `$jobs` and `$events`, are shared by all layers. Thus a module can use a definition of another module with no import, and the rule does not see it. The boundary is a convention that the rule helps you keep, not a wall.

A listener in one module can react to an event of another module. Give the event as `$events.<name>`, not as an import from the other module:

```ts
// layers/shop/server/listeners/invoice/reserve-stock.listener.ts
export const invoiceReserveStockListener = defineListener({
  event: $events.invoice.paid,
  handler: async ({ invoiceId }) => {
    await reserveStock(invoiceId);
  },
});
```

`nuxvel make:listener --module shop --event invoice.paid` finds the event in the app and in every other module, so it does not need the event to be in `shop`.

## Tests

Keep each test next to the file that it tests. The `functional` project of the Vitest config of a new app has no `include`, so Vitest also finds the tests in `layers/`. The `e2e` project includes each `tests/e2e/` folder, also the one of a module.

## Why not `modules/<name>`

Nuxt loads each file or folder in `modules/` as a local [Nuxt module](https://nuxt.com/docs/guide/going-further/modules), not as a layer. A folder there also needs an `extends` entry in `nuxt.config.ts` for each module. `layers/<name>/` needs neither.
