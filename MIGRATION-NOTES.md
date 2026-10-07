# Migration notes for 0.3.0

Each step below lists what an app changes by hand when the codemod cannot
do it. The release guide `docs/upgrade-0.3.md` collects these steps.

## Imports from the removed subpaths

nuxvel removes the subpaths `@nuxvel/nuxt/storage`, `@nuxvel/nuxt/queue`,
`@nuxvel/nuxt/redis` and `@nuxvel/nuxt/billing`. Import the
same name from its topic path. Codemod: `explicit-imports`.

Before:

```ts
import { useRedis } from "@nuxvel/nuxt/redis";
```

After:

```ts
import { useRedis } from "@nuxvel/nuxt/server/redis";
```

The topic of a name follows the docs guides: `useS3` and `useBucket` are
in `@nuxvel/nuxt/server/storage`, `useQueue` in
`@nuxvel/nuxt/server/queues`, and `useStripe` in
`@nuxvel/nuxt/server/billing`.

`@nuxvel/nuxt/database` stays. It exports only the schema helpers a
`drizzle.config.ts` schema file needs: `now`, `timestamps`, `belongsTo`,
`searchable`, `searchIndex` and their types, plus the four billing
tables, which schema files import. You can also import the billing
tables from `@nuxvel/nuxt/server/billing`.
