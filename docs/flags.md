# Feature flags & experiments

## Introduction

A feature flag turns a feature on for some users and off for the rest. An experiment splits users between named variants, for example two colours of a button. You define both in code. You change who sees what at runtime, with no deploy.

## Defining a flag

```ts
// server/flags/new-editor.flag.ts
export const newEditorFlag = defineFlag({ default: false });
```

Put each flag in its own file under `server/flags/`. nuxvel discovers the file, so you do not register it. The file path gives the flag name: `server/flags/new-editor.flag.ts` is the flag `new-editor`. `defineFlag` is auto-imported.

The auto-imported `$flags` namespace holds each flag under its path. Each path segment is in camelCase and has no kind suffix. `$flags.newEditor` is the flag in `server/flags/new-editor.flag.ts`. The `$experiments` namespace holds each experiment in the same way. A file under `server/flags/` goes into `$flags` or into `$experiments`, from its `defineFlag` or `defineExperiment` call. Go to definition on `$flags.newEditor` opens the flag file. Both namespaces are also available in the app, where each key holds only the name of the flag or experiment. See [Using flags in components](#using-flags-in-components).

| Option | Meaning |
|---|---|
| `default` | The value for a user that no targeting rule matches. Required. |
| `expiresAt` | An ISO date. After this date, `nuxvel flags:stale` reports the flag. |

Run `nuxvel make:flag new-editor` to generate this file. The generated flag is off by default. Add `--force` to overwrite a file that exists.

## Reading a flag on the server

```ts
if (await flag("new-editor")) {
  // show the new editor
}
```

`flag(name)` returns `true` or `false` for the current user. It is auto-imported on the server. It throws when no flag has this name.

Flag names are typed. `flag("new-edtior")` does not compile. The same applies to the names you give to `flagTargeting()`, `setFlagTargeting()`, `experimentState()`, `startExperiment()`, `stopExperiment()` and `experimentReport()`. Each of them takes only a flag, or only an experiment, that a file under `server/flags/` defines.

In place of the name, `flag()`, `experiment()` and each of these helpers except `experimentReport()` also take the definition, from `$flags`, `$experiments` or an import. Go to definition on the argument opens the file of the flag or experiment. `experiment()` then returns the variants of that definition.

```ts
if (await flag($flags.newEditor)) {
  // ...
}
const variant = await experiment($experiments.subscribeButton); // "control" | "green"
```

### The subject

```ts
await flag("new-editor", { id: user.id, role: user.role });
```

Inside an action, `flag()` evaluates for the action's actor when that actor is a user. Otherwise, inside a request, it evaluates for the signed-in user, with the role on their session. Pass a subject `{ id, role? }` to evaluate for a different user. Also pass a subject outside an action and outside a request, for example in a task.

With no user, a partial rollout is off. A flag at 100% is on for everyone, guests included.

## Targeting

```ts
await setFlagTargeting("new-editor", { percentage: 10 });
await setFlagTargeting("new-editor", { roles: { "beta-tester": true } });
```

A flag with no targeting has its `default` value for everyone. `setFlagTargeting(name, targeting)` replaces the targeting of a flag. The change applies on the next evaluation in every server process.

| Field | Meaning |
|---|---|
| `percentage` | The share of users, 0 to 100, that the flag is on for. |
| `roles` | A fixed value for each role. A role rule wins over `percentage`. |

The flag checks these rules in this order:

1. A rule for the role of the user.
2. The percentage rollout.
3. The `default` of the flag.

Percentage buckets are deterministic. The same user always gets the same answer at the same percentage. If you raise 10 to 20, the first 10% of users stay in, and another 10% join.

The targeting is stored in Redis, on the `durable` connection of `useRedis()`. `flagTargeting(name)` reads it back, with `updatedAt`. It returns `{}` when the flag has no targeting.

Each change writes a `flag.targeted` row to the [audit log](./audit.md), with the targeting `before` and `after`. The row names the actor in scope. With no actor in scope, the row names a `flags` system actor. The write of the audit row and the write to Redis are one unit: the audit row is written first, in a transaction that ends after the Redis write. When either write fails, the audit row rolls back and the targeting does not change, so an error from `setFlagTargeting()` or `nuxvel flags:set` always means that nothing was saved.

### From the command line

```sh
nuxvel flags:list
nuxvel flags:set new-editor --percentage 10
nuxvel flags:set new-editor --role beta-tester --value true
nuxvel flags:set new-editor --value false
nuxvel flags:stale
```

| Command | What it does |
|---|---|
| `flags:list` | Lists each flag with its default and targeting, and each experiment with its weights and status. |
| `flags:set <name>` | Changes the targeting of a flag. It keeps the rules you do not change. |
| `flags:stale` | Lists the flags that are due for removal, and the flags that no code references. |

`flags:set` takes these options:

- `--percentage <0-100>` sets the rollout.
- `--role <role>` sets a fixed value for that role. The value is `true` unless you also give `--value false`.
- `--value <true|false>` without `--role` turns the flag on (100%) or off (0%) for everyone.

`flags:list` and `flags:stale` accept `--json`. See [CLI](./cli.md).

### Stale flags

```ts
export const newEditorFlag = defineFlag({ default: false, expiresAt: "2026-12-31" });
```

`flags:stale` reports a flag in these cases:

- Its `expiresAt` date is in the past.
- Its targeting is at 100% and did not change for more than 30 days.
- No code references it.

A flag counts as referenced when its name, in quotes, appears in a file under `app/`, `server/`, `shared/` or `layers/`, for example `flag("new-editor")` or `useFlag('new-editor')`. A reference through `$flags`, such as `useFlag($flags.newEditor)`, also counts. The files under `server/flags/` and the test files do not count. A name that code builds at runtime, such as `"new-" + name`, is not found, so check an unreferenced flag before you delete it.

## Using flags in components

```vue
<script setup lang="ts">
const newEditor = useFlag("new-editor");
const sameFlag = useFlag($flags.newEditor);
const subscribeButton = useExperiment("subscribe-button");
const sameExperiment = useExperiment($experiments.subscribeButton);
</script>

<template>
  <NewEditor v-if="newEditor" />
  <UButton :color="subscribeButton === 'green' ? 'success' : 'primary'" label="Subscribe" />
</template>
```

`useFlag(name)` returns a `ComputedRef<boolean>`. It also takes the flag from `$flags`. In the app, `$flags.newEditor` is only `{ name: "new-editor" }`, so no server code goes into the browser bundle. Its type is the flag definition, so go to definition opens `server/flags/new-editor.flag.ts`. `useExperiment(name)` returns a ref of the variant, for example `"control" | "green" | undefined`. It also takes the experiment from `$experiments`. Both are auto-imported.

The server evaluates the values for the current user. The page gets only the results, never the targeting rules. During SSR, the page loads the values from `GET /api/flags` and carries them in the payload. The first render thus shows the correct value, with no flicker on hydration.

`GET /api/flags` returns `{ subject, flags, experiments }`:

- `subject` is the ID of the user that the values are for, or `null` for a guest.
- It reads the stored state of all flags and experiments in one Redis round trip.
- If the stored state of a flag is not valid targeting, the flag gets its default. If the stored state of an experiment is not valid, the experiment gets its control. The same applies when Redis is not available.

If the request fails during SSR, the page still renders. `useFlag()` is then `false` and `useExperiment()` is `undefined`. The browser loads the values again.

### Cached pages

A [`cached`](./rendering.md#cached-pages-and-flags) or prerendered page is one copy for all visitors, rendered for a guest. On such a page, the browser loads the values for its own user when the page starts. It records exposures only after that. A signed-in user thus sees their own value, and is counted under it, after a short flicker.

### Live updates

The values stay live. `setFlagTargeting()`, `startExperiment()` and `stopExperiment()` broadcast `changed` on the built-in `flags` channel. Each mounted `useFlag()` and `useExperiment()` listens on that channel and loads the values again. An open page updates with no reload. See [Realtime](./realtime.md).

## Defining an experiment

```ts
// server/flags/subscribe-button.experiment.ts
export const subscribeButtonExperiment = defineExperiment({
  variants: { control: 50, green: 50 },
});
```

An experiment lives under `server/flags/` too, one per file, with the `.experiment.ts` suffix and an export name that ends with `Experiment`. `defineExperiment` is auto-imported. The weights are relative, so `{ control: 1, green: 1 }` gives the same split. The first variant is the control.

Run `nuxvel make:experiment subscribe-button` to generate an experiment with the variants `control` and `treatment`, 50 each.

```ts
const variant = await experiment("subscribe-button"); // "control" | "green"
```

`experiment(name)` returns the variant of the current user. It takes an optional subject, like `flag()`. It throws when no experiment has this name.

## Running an experiment

```ts
await startExperiment("subscribe-button");
await stopExperiment("subscribe-button");
```

An experiment does nothing until you start it. Before the start, and after a stop, everyone gets the control and no exposure is recorded. From the command line, run `nuxvel experiment:start subscribe-button` or `nuxvel experiment:stop subscribe-button`.

While the experiment runs, assignment is deterministic and nothing is stored per user. The same user always gets the same variant. With no user, the variant is the control.

- The first start locks the weights. The experiment keeps these weights after a stop and a restart, even if you change `variants` in code. A change would move users to different variants. To change the weights, make a new experiment.
- To start a running experiment, or to stop a stopped one, does nothing.
- A start writes an `experiment.started` row to the audit log, and a stop writes `experiment.stopped`. Both rows hold the locked `variants`.
- Both update open pages live, like `setFlagTargeting()`.

`experimentState(name)` returns the stored state: `{ running, variants, startedAt, stoppedAt? }`. It returns `undefined` for an experiment that never started.

### Consent

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  nuxvel: {
    experiments: { requireConsent: true },
  },
});
```

```ts
// app/components/CookieBanner.vue, when the visitor accepts
useCookie("nuxvel-consent", { maxAge: 60 * 60 * 24 * 365 }).value = "granted";
```

With `requireConsent`, experiments count only the visitors who consent. A request without the cookie `nuxvel-consent=granted` gets the control of every experiment. `experiment()`, `useExperiment()` and `GET /api/flags` all answer with the control, and nuxvel records no exposure. With no exposure, `track()` records no conversion either, so the visitor is not tracked.

Set the cookie when the visitor accepts, for example in your cookie banner. Code that runs outside a request, such as a job, is not affected. Flags are not affected either. `NUXT_NUXVEL_EXPERIMENTS_REQUIRE_CONSENT` overrides the option at runtime.

## Renaming a flag

```ts
// server/flags/new-editor.flag.ts, after the flag moved to server/flags/editor/v2.flag.ts
import { editorV2Flag } from "./editor/v2.flag";

export default renamed(editorV2Flag);
```

The name of a flag is its path. Its targeting, experiment state, exposures, conversions and buckets are stored under that name. If you move the file, all of these reset and users change variants.

To prevent this, leave `renamed()` at the old path. The flag then answers to its new name and keeps its data under the old name. See [Renaming a definition](./index.md#renaming-a-definition).

## Exposures

An exposure records that a user saw a flag value or an experiment variant. It is the denominator of the results of an experiment. Exposures go into the `flag_exposures` table, defined in `server/database/schema/flag-exposures.schema.ts`:

```ts
import { now } from "@nuxvel/nuxt/database";

export const flagExposuresTable = pgTable(
  "flag_exposures",
  {
    name: text("name").notNull(),
    unitId: text("unit_id").notNull(),
    variant: text("variant").notNull(),
    exposedAt: timestamp("exposed_at").notNull().defaultNow().$defaultFn(now),
  },
  (table) => [primaryKey({ columns: [table.name, table.unitId, table.variant] })],
);
```

- `flag()` and `experiment()` record an exposure on the first call in a request for each user and value. More calls in the same request write nothing. An experiment records exposures only while it runs.
- `useFlag()` and `useExperiment()` record an exposure when the component mounts, through `POST /api/flags/exposures`. The server evaluates the value again. It does not use the value from the page. The load of the values for SSR records nothing. An unknown name gets a `404` with `data.code` set to `NOT_FOUND`.
- The table keeps one row per user per variant. The variant of a flag is `"true"` or `"false"`. A second render of the same page records nothing new.
- Guests, and evaluations with no user, record nothing.
- nuxvel writes the row outside the current transaction. A rollback does not remove it.

The flag tables hold user IDs. See [Privacy](./privacy.md#framework-tables) to include them in a data export and an erase.

## Conversions and results

```ts
// server/flags/subscribe-button.experiment.ts
export const subscribeButtonExperiment = defineExperiment({
  variants: { control: 50, green: 50 },
  metrics: ["newsletter.subscribed"],
});
```

```ts
await track("newsletter.subscribed");
```

List the metrics of an experiment in `metrics`. Then call `track(metric)` when a user converts. Metric names are typed. `track()` takes an optional subject, like `flag()`.

A conversion counts once per user per metric. It counts only for an experiment that the user has an exposure in. With no user, `track()` records nothing. Conversions go into the `flag_conversions` table, defined in `server/database/schema/flag-conversions.schema.ts`:

```ts
import { now } from "@nuxvel/nuxt/database";

export const flagConversionsTable = pgTable(
  "flag_conversions",
  {
    name: text("name").notNull(),
    unitId: text("unit_id").notNull(),
    metric: text("metric").notNull(),
    convertedAt: timestamp("converted_at").notNull().defaultNow().$defaultFn(now),
  },
  (table) => [primaryKey({ columns: [table.name, table.unitId, table.metric] })],
);
```

```sh
nuxvel experiment:report subscribe-button
# subscribe-button  sample ratio ok (p=1.00)
# control  weight 50  exposures 100  newsletter.subscribed 10 (10.0%, 95% CI 5.5%–17.4%)
# green  weight 50  exposures 100  newsletter.subscribed 25 (25.0%, 95% CI 17.5%–34.3%)
```

`nuxvel experiment:report <name>` shows the results for each variant:

- the weight and the number of exposures,
- for each metric, the conversions, the conversion rate and the 95% confidence interval.

The report uses the weights that the experiment locked at its start. If the experiment never started, it uses the weights in code.

The first line is a sample ratio check. It is a chi-square test of the exposures against the weights. If p is less than 0.001, the report shows `SAMPLE RATIO MISMATCH`. This means that users do not land in the variants as configured, so do not trust the results.

`experimentReport(name)` returns the same data from code, as `{ name, variants, sampleRatio }`.

## OpenFeature

```ts
// server/plugins/openfeature.ts
import { OpenFeature } from "@openfeature/server-sdk";

export default defineNitroPlugin(() => {
  OpenFeature.setProvider(nuxvelFlagProvider());
});
```

```ts
const client = OpenFeature.getClient();

const newEditor = await client.getBooleanValue("new-editor", false, { targetingKey: user.id, role: user.role });
const button = await client.getStringValue("subscribe-button", "control");
```

`nuxvelFlagProvider()` returns an [OpenFeature](https://openfeature.dev) server provider for your flags and experiments. It is auto-imported on the server. Install `@openfeature/server-sdk` in your app to use it. Code and libraries that speak OpenFeature then read nuxvel flags.

- A flag resolves as a boolean, through `flag()`. An experiment resolves as a string, the name of its variant, through `experiment()`.
- `targetingKey` is the user ID. A string `role` attribute is the role. Without a `targetingKey`, the subject is the signed-in user, as with `flag()`.
- Targeting, exposures and [consent](#consent) apply as usual.
- An unknown name gives the default value with the error code `FLAG_NOT_FOUND`. A number or object lookup, a flag read as a string, or an experiment read as a boolean gives the default value with `TYPE_MISMATCH`.

## Testing

```ts
// server/actions/posts/features.action.ts
import { z } from "zod";

export const postFeaturesAction = defineAction({
  input: z.object({}),
  handler: async () => ({
    newEditor: await flag("new-editor"),
    subscribeButton: await experiment("subscribe-button"),
  }),
});
```

```ts
// tests/functional/flags.test.ts
import { describe, it } from "vitest";
import {
  expect,
  expectRow,
  runAction,
  setFlagTargeting,
  startExperiment,
  stopExperiment,
} from "@nuxvel/nuxt/testing";
import { flagExposuresTable } from "#nuxvel/schema";
import { userFactory } from "#nuxvel/factories";

describe("flag fixtures", () => {
  it("turns a flag on and off for the code under test", async () => {
    const author = await userFactory();

    await setFlagTargeting("new-editor", { percentage: 100 });
    const on = await runAction("posts.features", {}, { actingAs: author });

    await setFlagTargeting("new-editor", { percentage: 0 });
    const off = await runAction("posts.features", {}, { actingAs: author });

    expect(on.newEditor).toBe(true);
    expect(off.newEditor).toBe(false);
  });

  it("starts and stops an experiment for the code under test", async () => {
    const author = await userFactory();

    await startExperiment("subscribe-button");
    const running = await runAction("posts.features", {}, { actingAs: author });

    await stopExperiment("subscribe-button");
    const stopped = await runAction("posts.features", {}, { actingAs: author });

    expect(running.subscribeButton).toMatch(/^(control|green)$/);
    await expectRow(flagExposuresTable, { name: "subscribe-button", unitId: author.id, variant: running.subscribeButton });
    expect(stopped.subscribeButton).toBe("control");
  });
});
```

`setFlagTargeting(name, targeting)`, `startExperiment(name)` and `stopExperiment(name)` come from `@nuxvel/nuxt/testing`. They change the flag or experiment in the app under test, like the server helpers of the same name. They take only names that a file under `server/flags/` defines. They also take the definition, or its stub from `$flags` or `$experiments` in `#nuxvel/test-namespaces`.

`enableFlag(name)` and `disableFlag(name)` set the percentage to 100 or 0. They remove the role overrides.

```ts
await enableFlag("new-editor");
```

`forceVariant(name, variant)` runs an experiment with every user in one variant. The app records exposures as for a running experiment. The variant must be one that the experiment defines.

```ts
await forceVariant("subscribe-button", "green");
```

Targeting and experiment state live in Redis. The test setup empties the Redis database of the test after each test. Thus each test starts with no targeting and with every experiment stopped. See [Vitest configuration](./testing.md#vitest-configuration).

To assert an exposure, use `expectRow()` on `flagExposuresTable`. See [Testing](./testing.md).

## See also

- [Rendering](./rendering.md)
- [Audit log](./audit.md)
- [Realtime](./realtime.md)
- [Privacy](./privacy.md)
- [CLI](./cli.md)
