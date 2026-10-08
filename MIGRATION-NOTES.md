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

## A `$<kind>` namespace indexed by a variable

The `explicit-imports` codemod rewrites only a member written with a dot. It
does not rewrite `$products[name]`. Import each definition and map the name
to it yourself.

Before:

```ts
const definition = $products[name];
```

After:

```ts
import { proProduct } from "#server/products/_pro.product";
import { courseProduct } from "#server/products/_course.product";

const products = { _pro: proProduct, _course: courseProduct };

const definition = products[name];
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

## A removed call whose definition it cannot map

The `definition-methods` codemod rewrites `dispatchAfterCommit()`,
`broadcast()`, `broadcastAfterCommit()`, `sendMail()`, `emit()` and
`notify()` to the method of the definition, and imports the definition
from its file, as the `explicit-imports` codemod does. A name that
matches no definition file gets no rewrite and one manual step.

Before:

```ts
const job = "post.notify-followers";

export default defineEventHandler(() => dispatchAfterCommit(job, { postId: 1 }));
```

After:

```ts
import { postNotifyFollowersJob } from "#server/jobs/post/notify-followers.job";

const job = "post.notify-followers";

export default defineEventHandler(() => postNotifyFollowersJob.dispatch({ postId: 1 }));
```

The same step covers a `renamed()` job, which has no job file of its own.
Import the job it renames and call `dispatch()` on it.

## A mail name with no mail file

The `notification-input` codemod returns the definition of a mail name in
`toMail`, imported from its file. A name that matches no file of
`server/mail/` gets no rewrite and one manual step.

Before:

```ts
export const postPublishedNotification = defineNotification({
  input: postInput,
  toMail: ({ postId }) => ({ mail: "post.gone", data: { postId } }),
});
```

After:

```ts
import { postPublishedMail } from "#server/mail/post/published.mail";

export const postPublishedNotification = defineNotification({
  input: postInput,
  toMail: ({ postId }) => ({ mail: postPublishedMail, input: { postId } }),
});
```

## A type probe that reads a client namespace

The `explicit-imports` codemod rewrites `useFlag($flags.probeRollout)` to
`useFlag("probe-rollout")`. It does not rewrite `typeof $flags.probeRollout`
in a type position. Use the string name in the type probe.

Before:

```ts
const stubIsTyped: IsAny<typeof $flags.probeRollout> extends true
  ? never
  : typeof $flags.probeRollout extends FlagNameArg
    ? true
    : never = true;
```

After:

```ts
const stubIsTyped: IsAny<FlagNameArg> extends true
  ? never
  : "probe-rollout" extends FlagNameArg
    ? true
    : never = true;
```

Add a negative check beside it. Put `// @ts-expect-error` above a call with
a name that no definition has, such as `useFlag("probe-missing")`.

## A third-party layer that used nuxvel server globals

nuxvel no longer registers its server names, the server `$<kind>`
namespaces or the exports of `shared/schemas/` as globals. The
`explicit-imports` codemod rewrites the files of an app. Run it in the
folder of the layer too, or make the same change by hand. A layer that
nuxvel does not control needs a release of its own.

Before:

```ts
export default defineAction({
  input: createPostInput,
  handler: async (input) => {
    await $jobs.post.notifyFollowers.dispatch({ postId: input.id });
    return useDb().insert(postsTable).values(input);
  },
});
```

After:

```ts
import { defineAction } from "@nuxvel/nuxt/server/actions";
import { useDb } from "@nuxvel/nuxt/server/database";
import { postsTable } from "#nuxvel/schema";
import { notifyFollowersJob } from "#server/jobs/post/notify-followers.job";
import { createPostInput } from "#shared/schemas/post";

export default defineAction({
  input: createPostInput,
  handler: async (input) => {
    await notifyFollowersJob.dispatch({ postId: input.id });
    return useDb().insert(postsTable).values(input);
  },
});
```

Nuxt and Nitro names stay global. A layer keeps `defineEventHandler`,
`getQuery` and `useRuntimeConfig` without an import.

## A client namespace passed to a composable, and a layer that used app globals

nuxvel no longer registers its app names or the client `$flags`,
`$experiments`, `$channels` and `$jobs` namespaces as globals. The
composables `useFlag()`, `useExperiment()`, `useChannel()`,
`usePresence()` and `useJobChannel()` take a typed string name. The
`explicit-imports` codemod rewrites the files of an app. It prints
`file:line` for a namespace that it cannot rewrite, for example one that
a function returns or one that a variable holds. Replace each one by hand.
Run the codemod in the folder of a layer too, or make the same change by
hand. A layer that nuxvel does not control needs a release of its own.

Before:

```vue
<script setup lang="ts">
const flags = $flags;
const oneClick = useFlag(flags.checkout.oneClick);
const room = usePresence($channels.posts, { params: { id: 1 } });
</script>
```

After:

```vue
<script setup lang="ts">
import { useFlag } from "@nuxvel/nuxt/app/flags";
import { usePresence } from "@nuxvel/nuxt/app/realtime";

const oneClick = useFlag("checkout.one-click");
const room = usePresence("posts", { params: { id: 1 } });
</script>
```

A name that no definition has fails to compile. The name of a flag, an
experiment, a channel or a job is the name that its definition file has
under `server/`, for example `checkout.one-click`.

A test that checked the client stubs, such as `$flags.probeRollout`
holding `{ name: "probe-rollout" }`, has no use any more. Remove it. A
test file that imports a nuxvel name from `#imports` imports it from its
topic path, for example `import { $api } from "@nuxvel/nuxt/app/api"`.

With `nuxvel.seo.ogImage`, `useSeo` from `@nuxvel/nuxt/app/seo` still
renders the Open Graph image. Nuxt resolves that path to the variant that
calls `defineOgImage()`.
