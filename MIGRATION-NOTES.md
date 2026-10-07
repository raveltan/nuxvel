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

## A `$<kind>` member that names no definition

The `explicit-imports` codemod rewrites `$jobs.post.notifyFollowers` to the
`postNotifyFollowersJob` that its file exports. It also adds the import. It
writes no import for a path that matches no definition file, such as a
typo. Import the definition yourself.

Before:

```ts
export default defineEventHandler(() => $jobs.post.gone.dispatch({ postId: 1 }));
```

After:

```ts
import { goneJob } from "#server/jobs/post/gone.job";

export default defineEventHandler(() => goneJob.dispatch({ postId: 1 }));
```

The codemod prints the same step in three more cases. A `$<kind>` name
alone (`$jobs` without a member) names no definition. A member whose
definition name the file already declares needs the same look by hand. An
import left with no use after the change is safe to remove.

## A `shared/schemas/` name that two files export

The codemod imports a name that exactly one file of `shared/schemas/`
exports. Two files with the same name give no answer.

Before:

```ts
export default defineEventHandler(() => postInput);
```

After:

```ts
import { postInput } from "#shared/schemas/post";

export default defineEventHandler(() => postInput);
```

Use the file that holds the schema the code means.

## A client namespace in another position

The `explicit-imports` codemod rewrites the first argument of `useFlag()`,
`useExperiment()`, `useChannel()`, `usePresence()` and `useJobChannel()`
from a client namespace to the string name of the definition. It does not
rewrite any other use of the namespace. Pass the string name yourself.

Before:

```ts
const name = $flags.newEditor;
```

After:

```ts
const name = "new-editor";
```

## A `.vue` file with a `<script>` block but no `<script setup>`

The codemod adds the imports to an existing `<script setup>` block. It
creates this block when the file has none. A file with only a `<script>`
block gets no import, because a plain script does not expose a binding to
the template. Add the `<script setup>` block by hand.

Before:

```vue
<script>
export default { name: "PostForm" };
</script>

<template>
  <ActionForm :action="$api.post.update" />
</template>
```

After:

```vue
<script setup lang="ts">
import { $api } from "@nuxvel/nuxt/app/api";
import { ActionForm } from "@nuxvel/nuxt/app/forms";
</script>

<script>
export default { name: "PostForm" };
</script>

<template>
  <ActionForm :action="$api.post.update" />
</template>
```
