# Tutorial: a status page

## Introduction

This tutorial builds the status page of a small software company. Visitors see the open incidents, read each update and page through the past incidents. A visitor subscribes with an email address and gets a mail for each update. The team signs in, opens incidents and posts updates. An uptime monitor also opens an incident when a check goes down, and resolves it when the check is up again.

The app uses the parts of nuxvel that the [first app](./first-app.md) and [course platform](./course-platform.md) tutorials use little or not at all:

- **Queues and the outbox**: an action dispatches a job with `$jobs.x.dispatch()`, and the job sends one mail to each subscriber. The job is safe to run two times.
- **Mail**: a Vue template with MJML sections and columns, without `<MailLayout>`.
- **Notifications**: the team gets a notification in the bell when an incident opens.
- **Inbound webhooks**: a signed `defineWebhook()` that opens and resolves incidents, one time for each event.
- **Feature flags**: a flag that stops the webhook from opening incidents, and a component that shows the state of the flag.
- **Cache**: `remember()` for the incident pages and the history, and `invalidates` on the actions.
- **Pagination**: the past incidents in a `<DataTable>`, ten to a page.
- **Schedules**: a reminder to the team for an incident with no update for an hour.

Each chapter adds code and its tests. The tests use the three layers of nuxvel: functional tests, component tests and end-to-end tests. See [Testing](../testing.md).

You need Node.js 24, Docker, and about 90 minutes. Run every command from the app folder.

## 1. Create the app

```bash
npm create nuxvel@latest status-page
cd status-page
npm install
./nv services up
./nv test
```

```
 Test Files  2 passed (2)
      Tests  5 passed (5)
```

See [Starting a new app](../create.md) for what the command writes. `./nv services up` starts Postgres, Redis, Mailpit and SeaweedFS from `docker-compose.yml`. They stay running until `./nv services down`.

## 2. Database

An incident has a title and a status. The status goes from `investigating` to `identified`, `monitoring` and `resolved`. Each change of the status comes with an update: a short text for the visitors. An incident that the monitor opens records the name of the check. A subscriber is an email address.

Generate the three tables. The fields after the name become the columns:

```bash
./nv make:schema incident title status:enum=investigating,identified,monitoring,resolved:default=investigating monitor:nullable resolved_at:timestamp:nullable
./nv make:schema incident-update incident:references status:enum=investigating,identified,monitoring,resolved body:text announced_at:timestamp:nullable
./nv make:schema subscriber email:email:unique
```

```
✔ Created server/database/schema/incident.schema.ts
✔ Created shared/schemas/incident.ts
✔ Created server/database/schema/incident-update.schema.ts
✔ Created shared/schemas/incident-update.ts
✔ Created server/database/schema/subscriber.schema.ts
✔ Created shared/schemas/subscriber.ts
```

```ts
// server/database/schema/incident.schema.ts
import { pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { timestamps } from "@nuxvel/nuxt/database";

export const incidentTable = pgTable("incident", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  status: text("status", { enum: ["investigating", "identified", "monitoring", "resolved"] }).notNull().default("investigating"),
  monitor: varchar("monitor", { length: 255 }),
  resolvedAt: timestamp("resolved_at"),
  ...timestamps(),
});

export type IncidentRow = typeof incidentTable.$inferSelect;
export type NewIncidentRow = typeof incidentTable.$inferInsert;
```

```ts
// server/database/schema/incident-update.schema.ts
import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { timestamps } from "@nuxvel/nuxt/database";
import { incidentTable } from "./incident.schema";

export const incidentUpdateTable = pgTable("incident_update", {
  id: serial("id").primaryKey(),
  incidentId: integer("incident_id").notNull().references(() => incidentTable.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["investigating", "identified", "monitoring", "resolved"] }).notNull(),
  body: text("body").notNull(),
  announcedAt: timestamp("announced_at"),
  ...timestamps(),
}, (table) => [index("incident_update_incident_id_idx").on(table.incidentId)]);

export type IncidentUpdateRow = typeof incidentUpdateTable.$inferSelect;
export type NewIncidentUpdateRow = typeof incidentUpdateTable.$inferInsert;
```

An `enum` field is a `text` column that accepts only the listed values. `incident:references` is the column `incident_id`, with a foreign key and an index. The foreign key deletes the updates of a deleted incident. `announced_at` records when the subscribers got the update by mail. [Chapter 6](#6-subscribers-and-mail) uses it. `subscriber.email` is unique, so an address subscribes one time.

Each command also wrote the Zod schemas of its table in `shared/schemas/`. They are a start for a generic form: a create input with all fields, an update input and a row schema. This app needs other inputs. Replace the three files:

```ts
// shared/schemas/incident.ts
import { z } from "zod";

export const incidentStatus = z.enum(["investigating", "identified", "monitoring", "resolved"]);

export const incidentIdInput = z.object({
  id: z.number().int().positive(),
});

export const openIncidentInput = z.object({
  title: z.string().trim().min(1, "Name the problem").max(255),
  body: z.string().trim().min(1, "Tell visitors what you know").meta({ input: "textarea" }),
});

export const incidentUpdateSchema = z.object({
  id: z.number(),
  status: incidentStatus,
  body: z.string(),
  createdAt: z.date(),
});

export const incidentSchema = z.object({
  id: z.number(),
  title: z.string(),
  status: incidentStatus,
  resolvedAt: z.date().nullable(),
  createdAt: z.date(),
  updates: z.array(incidentUpdateSchema),
});
```

```ts
// shared/schemas/incident-update.ts
import { z } from "zod";
import { incidentStatus } from "./incident";

export const postIncidentUpdateInput = z.object({
  incidentId: z.number().int().positive(),
  status: incidentStatus,
  body: z.string().trim().min(1, "Write the update"),
});
```

```ts
// shared/schemas/subscriber.ts
import { z } from "zod";

export const subscribeInput = z.object({
  email: z.email("Enter an email address").max(255),
});
```

`openIncidentInput` is the form that opens an incident: a title and the first update. `postIncidentUpdateInput` is the form for each next update. The second argument of `min()` is the message that the form shows. `incidentSchema` is what the browser gets for one incident: the row and its updates. A schema that the browser gets lists only the columns that a visitor may see, so `monitor` and `announcedAt` are not in it. nuxvel auto-imports every export of `shared/schemas/` in `app/` and in `server/`.

Write the migration and apply it:

```bash
./nv db:generate --name incidents
./nv db:migrate
./nv db:check
```

`db:generate` writes `server/database/migrations/0017_incidents.sql`. Read the SQL before you apply it. `db:check` prints `✔ Every foreign key has an index`.

### Factories

```bash
./nv make:factory incident
./nv make:factory incident-update
./nv make:factory subscriber
```

Each command writes a factory and a test that inserts two rows. Give the incidents titles that look like real incidents, and add a state for a resolved incident:

```ts
// server/factories/incident.factory.ts
import { faker } from "@faker-js/faker";
import { defineFactory } from "@nuxvel/nuxt/factories";
import { incidentTable } from "#nuxvel/schema";

export const incidentFactory = defineFactory(incidentTable, {
  title: () => `${faker.helpers.arrayElement(["API", "Dashboard", "Sign-in", "Webhooks"])} ${faker.helpers.arrayElement(["is slow", "returns errors", "is down"])}`,
});

export const resolvedIncidentFactory = incidentFactory.state({
  status: "resolved",
  resolvedAt: () => faker.date.recent({ days: 60 }),
});
```

```ts
// server/factories/incident-update.factory.ts
import { faker } from "@faker-js/faker";
import { incidentFactory } from "./incident.factory";
import { defineFactory } from "@nuxvel/nuxt/factories";
import { incidentUpdateTable } from "#nuxvel/schema";

export const incidentUpdateFactory = defineFactory(incidentUpdateTable, {
  incidentId: async () => (await incidentFactory()).id,
  status: "investigating",
  body: () => faker.lorem.sentence(),
});
```

`factory.state()` returns a factory with other values. A resolved incident gets a `resolvedAt` in the last 60 days. The subscriber factory stays as the generator wrote it: it gives each row a unique email.

### Seeding

The demo data is a history of twelve resolved incidents and one subscriber. Replace the seeder and its test:

```ts
// server/seeders/database.seeder.ts
import { resolvedIncidentFactory, incidentUpdateFactory, subscriberFactory, userFactory } from "#nuxvel/factories";

const DEMO_EMAIL = "demo@example.com";
const DEMO_PASSWORD = "demo-password";

export const databaseSeeder = defineSeeder(async () => {
  await userFactory.withPassword(DEMO_PASSWORD)({ name: "Demo User", email: DEMO_EMAIL, emailVerified: true });
  await userFactory.count(3)();

  await resolvedIncidentFactory
    .has(1, (incident) => incidentUpdateFactory.for("incidentId", incident).state({ status: "resolved", body: "This incident is resolved." }))
    .count(12)();
  await subscriberFactory({ email: "reader@example.com" });

  return [`Sign in as ${DEMO_EMAIL} with the password ${DEMO_PASSWORD}`];
});
```

```ts
// tests/functional/seeders.test.ts
import { expectCount, expectRow, runSeeder, signIn } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { userTable, incidentTable, incidentUpdateTable, subscriberTable } from "#nuxvel/schema";

describe("the database seeder", () => {
  it("creates a demo user, a history of resolved incidents and a subscriber", async () => {
    await runSeeder("database");

    await expectRow(userTable, { email: "demo@example.com", name: "Demo User" });
    await expectCount(incidentTable, 12, { status: "resolved" });
    await expectCount(incidentUpdateTable, 12, { status: "resolved" });
    await expectRow(subscriberTable, { email: "reader@example.com" });

    await signIn("demo@example.com", "demo-password");
  });
});
```

`.has(1, ...)` inserts one update for each incident. `.count(12)` inserts twelve incidents. Run the tests and seed the dev database:

```bash
./nv test tests/functional/seeders.test.ts server/factories
./nv db:seed
```

See [Database](../database.md) and [Testing: factories](../testing.md#factories).

## 3. The status page

The status page is public. It shows the open incidents, one page for each incident and a list of the past incidents. Generate the router:

```bash
./nv make:router status
```

`make:router` writes an empty router, `export const statusRouter = {}`. The file name gives the namespace, so the browser calls `trpc.status.current`. An incident and its updates come from two tables. Put the function that joins them in `server/utils/`, where nuxvel auto-imports it on the server:

```ts
// server/utils/with-updates.ts
import { desc, inArray } from "drizzle-orm";
import type { IncidentRow } from "#nuxvel/schema";
import { incidentUpdateTable } from "#nuxvel/schema";

export async function withUpdates(incidents: IncidentRow[]) {
  const updates = await useDb()
    .select()
    .from(incidentUpdateTable)
    .where(inArray(incidentUpdateTable.incidentId, incidents.map((incident) => incident.id)))
    .orderBy(desc(incidentUpdateTable.id));

  return incidents.map((incident) => ({
    ...incident,
    updates: updates.filter((update) => update.incidentId === incident.id),
  }));
}
```

The function reads the updates of all the incidents in one query, newest first. A page with ten incidents thus runs two queries, not eleven. Then write the three procedures:

```ts
// server/trpc/routers/status.router.ts
import { desc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { incidentTable } from "#nuxvel/schema";

export const statusRouter = {
  current: publicProcedure.output(z.array(incidentSchema)).query(async () =>
    withUpdates(
      await useDb().select().from(incidentTable).where(ne(incidentTable.status, "resolved")).orderBy(desc(incidentTable.id)),
    ),
  ),
  incident: publicProcedure
    .input(incidentIdInput)
    .output(incidentSchema)
    .query(async ({ input }) =>
      withUpdates([await findOrFail(incidentTable, input.id)]).then(firstOrFail),
    ),
  history: publicProcedure
    .input(paginationSchema.optional())
    .output(paginated(incidentSchema.omit({ updates: true })))
    .query(({ input }) =>
      paginate(
        useDb()
          .select()
          .from(incidentTable)
          .where(eq(incidentTable.status, "resolved"))
          .orderBy(desc(incidentTable.resolvedAt), desc(incidentTable.id))
          .$dynamic(),
        { perPage: 10, ...input },
      ),
    ),
};
```

`publicProcedure` answers each visitor, also a guest. `current` lists the incidents that are not resolved. `incident` returns one incident, or `NOT_FOUND`. `history` returns one page of resolved incidents, the last resolved first. `paginate()` returns `{ rows, page, perPage, total, lastPage }`, and `paginated()` is the schema of that object. `paginationSchema` lets the page choose `page` and `perPage`. The router sets `perPage: 10` before `...input`, so ten is the default. See [Database: pagination](../database.md#pagination).

Test the router. `guest().trpc` calls it as a visitor:

```ts
// server/trpc/routers/status.router.test.ts
import { expect, expectConstantQueries, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { incidentFactory, resolvedIncidentFactory, incidentUpdateFactory } from "#nuxvel/factories";

describe("status router", () => {
  it("lists the open incidents with their updates, newest update first", async () => {
    const incident = await incidentFactory({ title: "API is slow" });
    const first = await incidentUpdateFactory.for("incidentId", incident)({ body: "Looking into it." });
    const second = await incidentUpdateFactory.for("incidentId", incident)({ status: "identified", body: "A slow query." });
    await resolvedIncidentFactory();

    const current = await guest().trpc.status.current();

    expect(current).toHaveLength(1);
    expect(current[0]).toMatchObject({ title: "API is slow" });
    expect(current[0]?.updates.map((update) => update.id)).toEqual([second.id, first.id]);
  });

  it("reads the updates of all incidents in one query", async () => {
    await expectConstantQueries(async (size) => {
      await incidentFactory.has(2, (incident) => incidentUpdateFactory.for("incidentId", incident)).count(size)();
      await guest().trpc.status.current();
    });
  });

  it("shows one incident, also a resolved one", async () => {
    const incident = await resolvedIncidentFactory({ title: "Sign-in is down" });

    await expect(guest().trpc.status.incident({ id: incident.id })).resolves.toMatchObject({ title: "Sign-in is down", status: "resolved" });
    await expect(guest().trpc.status.incident({ id: incident.id + 1 })).rejects.toBeTrpcError("NOT_FOUND");
  });

  it("pages the resolved incidents, 10 to a page, last resolved first", async () => {
    const newest = await resolvedIncidentFactory({ resolvedAt: new Date("2026-09-30T10:00:00Z") });
    await resolvedIncidentFactory.count(11)({ resolvedAt: new Date("2026-09-01T10:00:00Z") });
    await incidentFactory();

    const first = await guest().trpc.status.history();
    const second = await guest().trpc.status.history({ page: 2 });

    expect(first).toMatchObject({ page: 1, perPage: 10, total: 12, lastPage: 2 });
    expect(first.rows[0]?.id).toBe(newest.id);
    expect(second.rows).toHaveLength(2);
  });
});
```

`expectConstantQueries` runs the call for 1 and for 4 incidents and checks that the query count does not grow. Run `./nv test server/trpc`.

### The pages

The status labels and their colors are used by more than one component. Put them in `app/utils/`, where nuxvel auto-imports them in the app:

```ts
// app/utils/status-labels.ts
export const statusLabels = {
  investigating: { label: "Investigating", color: "error" },
  identified: { label: "Identified", color: "warning" },
  monitoring: { label: "Monitoring", color: "info" },
  resolved: { label: "Resolved", color: "success" },
} as const;
```

A card shows one incident and its updates:

```vue
<!-- app/components/IncidentCard.vue -->
<script setup lang="ts">
defineProps<{ incident: RouterOutputs["status"]["current"][number] }>();
</script>

<template>
  <UCard>
    <div class="flex items-center justify-between gap-4">
      <ULink :to="{ name: 'incidents-id', params: { id: incident.id } }" class="font-semibold">{{ incident.title }}</ULink>
      <UBadge v-bind="statusLabels[incident.status]" variant="subtle" />
    </div>
    <ol class="mt-4 space-y-3">
      <li v-for="update in incident.updates" :key="update.id" class="text-sm">
        <p>
          <span class="font-medium">{{ statusLabels[update.status].label }}</span>
          <span class="text-muted"> · <DateTime :value="update.createdAt" relative /></span>
        </p>
        <p>{{ update.body }}</p>
      </li>
    </ol>
  </UCard>
</template>
```

`RouterOutputs` gives the type of one incident from the router. `<DateTime relative>` shows a time such as `5 minutes ago`. Replace the home page of the starter with the status page:

```vue
<!-- app/pages/index.vue -->
<script setup lang="ts">
definePageMeta({ layout: "home" });
useSeo({ title: "Status" });

const current = $api.status.current.useQuery();
</script>

<template>
  <UContainer class="max-w-3xl space-y-6 py-8">
    <h1 class="text-2xl font-semibold">System status</h1>
    <QueryState :query="current">
      <template #empty>
        <UAlert color="success" variant="subtle" icon="i-lucide-circle-check" title="All systems operational" />
      </template>
      <template #default="{ data }">
        <ul class="space-y-4">
          <li v-for="incident in data" :key="incident.id">
            <IncidentCard :incident="incident" />
          </li>
        </ul>
      </template>
    </QueryState>
    <ULink :to="{ name: 'history' }" class="text-sm font-medium text-primary">Past incidents</ULink>
  </UContainer>
</template>
```

`<QueryState>` shows a loading state, an error state and the `empty` slot for an empty list. No open incident thus shows **All systems operational**. Add the page of one incident and the history:

```vue
<!-- app/pages/incidents/[id].vue -->
<script setup lang="ts">
definePageMeta({ layout: "home" });

const id = Number(useRoute().params.id);
const incident = $api.status.incident.useQuery({ id });

useSeo(() => ({ title: incident.data?.title ?? "Incident" }));
</script>

<template>
  <UContainer class="max-w-3xl space-y-6 py-8">
    <QueryState :query="incident">
      <template #default="{ data }">
        <h1 class="text-2xl font-semibold">{{ data.title }}</h1>
        <IncidentCard :incident="data" />
      </template>
    </QueryState>
    <ULink :to="{ name: 'index' }" class="text-sm font-medium text-primary">Current status</ULink>
  </UContainer>
</template>
```

```vue
<!-- app/pages/history.vue -->
<script setup lang="ts">
definePageMeta({ layout: "home" });
useSeo({ title: "Past incidents" });

const route = useRoute();
const input = computed(() => paginationSchema.catch({}).parse(route.query));
const history = $api.status.history.useQuery(input);
</script>

<template>
  <UContainer class="max-w-3xl space-y-6 py-8">
    <h1 class="text-2xl font-semibold">Past incidents</h1>
    <DataTable
      :query="history"
      :columns="[
        { accessorKey: 'title', header: 'Incident' },
        { accessorKey: 'resolvedAt', header: 'Resolved' },
      ]"
    >
      <template #empty>
        <UEmpty title="No past incidents" />
      </template>
      <template #title-cell="{ row }">
        <ULink :to="{ name: 'incidents-id', params: { id: row.original.id } }">{{ row.original.title }}</ULink>
      </template>
      <template #resolvedAt-cell="{ row }">
        <DateTime v-if="row.original.resolvedAt" :value="row.original.resolvedAt" />
      </template>
    </DataTable>
  </UContainer>
</template>
```

`<DataTable>` shows one page of a paginated query, with page links under the table. The page number is in the URL, as `?page=2`. `paginationSchema.catch({})` changes a URL that is not valid to the first page. See [Frontend: data tables](../frontend.md#data-tables).

Run `npm run dev`, then open `/` and `/history`. The status page shows **All systems operational**. The history shows ten of the twelve seeded incidents, and **Page 2** shows the other two.

### Test the card

A component test is a story with a `play` function. Generate the story, then give it an incident:

```bash
./nv make:story IncidentCard
```

```ts
// app/components/IncidentCard.stories.ts
import type { Meta, StoryObj } from "@storybook-vue/nuxt";
import { expect, link, page, text } from "@nuxvel/nuxt/storybook/test";
import IncidentCard from "./IncidentCard.vue";

const meta = {
  component: IncidentCard,
  args: {
    incident: {
      id: 7,
      title: "API is slow",
      status: "identified",
      resolvedAt: null,
      createdAt: new Date("2026-10-01T09:00:00Z"),
      updates: [
        { id: 2, status: "identified", body: "A slow database query. We are deploying a fix.", createdAt: new Date("2026-10-01T09:20:00Z") },
        { id: 1, status: "investigating", body: "We are looking into slow responses.", createdAt: new Date("2026-10-01T09:00:00Z") },
      ],
    },
  },
} satisfies Meta<typeof IncidentCard>;
export default meta;

export const Identified: StoryObj<typeof meta> = {
  play: async () => {
    await expect(link(page, "API is slow")).toHaveAttribute("href", "/incidents/7");
    await expect(text(page, "Identified").first()).toBeVisible();
    await expect(text(page, "A slow database query. We are deploying a fix.")).toBeVisible();
    await expect(page.getByRole("listitem")).toHaveCount(2);
  },
};
```

`args` gives the props of the component. The helpers of `@nuxvel/nuxt/storybook/test` find an element by its role and name, as a screen reader does. `text(page, "Identified")` finds two elements, the badge and the label of the newest update, so the test takes the first. Run the component tests:

```bash
npm run test:ui
```

### The starter browser tests

The starter has browser tests in `tests/e2e/home.test.ts`. Three of them look for the old home page: the text `Signed in as ...` and the heading `Welcome to nuxvel`. The layout of the status page shows the email of a signed-in user as the button of the user menu. Change the three checks:

```ts
// tests/e2e/home.test.ts
    await expect(button(page, email)).toBeVisible();
```

```ts
// tests/e2e/home.test.ts
    await expect(button(resetPage, email)).toBeVisible();
```

```ts
// tests/e2e/home.test.ts
    await expect(heading(page, "System status")).toBeVisible();
```

```bash
npm run test:e2e
```

The fourth test, `expectNoSmoke()`, opens each page without params, also `/history`, and fails on an error in the page.

## 4. Open and update incidents

The team opens an incident and posts the updates. In this app, each account is a member of the team. Two actions do the writes:

```bash
./nv make:action incidents/open-incident
./nv make:action incidents/post-update
```

```ts
// server/actions/incidents/open-incident.action.ts
import { z } from "zod";
import { incidentTable, incidentUpdateTable } from "#nuxvel/schema";

export const openIncidentAction = defineAction({
  input: openIncidentInput.extend({ monitor: z.string().max(255).optional() }),
  handler: async ({ title, body, monitor }) => {
    const incident = await insertOne(incidentTable, { title, monitor });
    await useDb().insert(incidentUpdateTable).values({ incidentId: incident.id, status: "investigating", body });

    return incident;
  },
});
```

```ts
// server/actions/incidents/post-update.action.ts
import { eq } from "drizzle-orm";
import { incidentTable, incidentUpdateTable } from "#nuxvel/schema";

export const postUpdateAction = defineAction({
  input: postIncidentUpdateInput,
  errors: {
    "incident.resolved": "This incident is already resolved",
  },
  handler: async ({ incidentId, status, body }, _ctx, fail) => {
    const incident = await findOrFail(incidentTable, incidentId);
    if (incident.status === "resolved") return fail("incident.resolved");

    await useDb()
      .update(incidentTable)
      .set({ status, resolvedAt: status === "resolved" ? now() : null })
      .where(eq(incidentTable.id, incidentId));

    return insertOne(incidentUpdateTable, { incidentId, status, body });
  },
});
```

An action checks its input and runs its handler in one transaction. The incident and its first update are thus written together, or not at all. The input of `openIncidentAction` adds `monitor` to the form input. Only server code sets it: [chapter 8](#8-the-monitor-webhook) passes it from the webhook.

`postUpdateAction` declares a typed failure. `fail("incident.resolved")` stops the action with that code and message, and the transaction rolls back. A resolve sets `resolvedAt` with `now()`, the clock that the tests can move. Replace the generated tests:

```ts
// server/actions/incidents/open-incident.action.test.ts
import { expect, expectRow, runAction } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { incidentUpdateTable } from "#nuxvel/schema";
import { userFactory } from "#nuxvel/factories";

describe("incidents/open-incident action", () => {
  it("opens an incident with its first update", async () => {
    const ada = await userFactory();

    const incident = await runAction(
      "incidents.open-incident",
      { title: "API is slow", body: "We are looking into slow responses." },
      { actingAs: ada },
    );

    expect(incident).toMatchObject({ title: "API is slow", status: "investigating", monitor: null });
    await expectRow(incidentUpdateTable, { incidentId: incident.id, status: "investigating", body: "We are looking into slow responses." });
  });

  it.for<{ name: string; input: { title: string; body: string }; errors: Record<string, string> }>([
    { name: "a blank title", input: { title: "  ", body: "Slow responses." }, errors: { title: "Name the problem" } },
    { name: "a blank body", input: { title: "API is slow", body: "" }, errors: { body: "Tell visitors what you know" } },
  ])("rejects $name", async ({ input, errors }) => {
    const ada = await userFactory();

    await expect(runAction("incidents.open-incident", input, { actingAs: ada })).rejects.toHaveValidationErrors(errors);
  });
});
```

```ts
// server/actions/incidents/post-update.action.test.ts
import { expect, expectRow, freezeTime, runAction } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { incidentTable } from "#nuxvel/schema";
import { incidentFactory, resolvedIncidentFactory, userFactory } from "#nuxvel/factories";

describe("incidents/post-update action", () => {
  it("adds an update and moves the incident to its status", async () => {
    const ada = await userFactory();
    const incident = await incidentFactory();

    await runAction("incidents.post-update", { incidentId: incident.id, status: "identified", body: "A slow query." }, { actingAs: ada });

    await expectRow(incidentTable, { id: incident.id, status: "identified", resolvedAt: null });
  });

  it("stamps the time of a resolve", async () => {
    const ada = await userFactory();
    const incident = await incidentFactory();
    const resolvedAt = await freezeTime(new Date("2026-10-01T09:30:00Z"));

    await runAction("incidents.post-update", { incidentId: incident.id, status: "resolved", body: "Fixed." }, { actingAs: ada });

    await expectRow(incidentTable, { id: incident.id, status: "resolved", resolvedAt });
  });

  it("refuses an update on a resolved incident", async () => {
    const ada = await userFactory();
    const incident = await resolvedIncidentFactory();

    await expect(
      runAction("incidents.post-update", { incidentId: incident.id, status: "monitoring", body: "Again?" }, { actingAs: ada }),
    ).rejects.toBeActionError("incident.resolved");
  });
});
```

`it.for` runs one test for each case. `toHaveValidationErrors` checks the message of each field. `freezeTime()` stops the clock of the app and returns the time, so the test can compare `resolvedAt` exactly. Run `./nv test server/actions`.

### The team router

```bash
./nv make:router incident
```

```ts
// server/trpc/routers/incident.router.ts
import { openIncidentAction } from "#server/actions/incidents/open-incident.action";

export const incidentRouter = {
  open: authedProcedure
    .input(openIncidentInput)
    .output(incidentSchema.omit({ updates: true }))
    .mutation(async ({ input }) => {
      const incident = await openIncidentAction(input);
      flash("Incident opened");
      return incident;
    }),
  postUpdate: authedProcedure
    .output(incidentUpdateSchema)
    .action($actions.incidents.postUpdate),
};
```

`authedProcedure` refuses a guest with `UNAUTHORIZED` and gives the signed-in user as `ctx.actor`. `flash()` keeps a message for the next page. The update has no flash message, because its form stays on the page and shows its own toast. Test the router:

```ts
// server/trpc/routers/incident.router.test.ts
import { actingAs, expect, expectActionCalled, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { incidentFactory, userFactory } from "#nuxvel/factories";

describe("incident router", () => {
  it("opens an incident as the signed-in member of the team", async () => {
    const ada = await userFactory();

    const incident = await actingAs(ada).trpc.incident.open({ title: "API is slow", body: "Looking into it." });

    expect(incident).toMatchObject({ title: "API is slow", status: "investigating" });
    await expectActionCalled("incidents.open-incident", { actingAs: ada });
  });

  it("posts an update", async () => {
    const ada = await userFactory();
    const incident = await incidentFactory();

    const update = await actingAs(ada).trpc.incident.postUpdate({ incidentId: incident.id, status: "monitoring", body: "A fix is out." });

    expect(update).toEqual({ id: expect.any(Number), status: "monitoring", body: "A fix is out.", createdAt: expect.any(Date) });
  });

  it("refuses a guest", async () => {
    await expect(guest().trpc.incident.open({ title: "Fake", body: "Fake" })).rejects.toBeTrpcError("UNAUTHORIZED");
    await expect(guest().trpc.incident.postUpdate({ incidentId: 1, status: "resolved", body: "Fake" })).rejects.toBeTrpcError("UNAUTHORIZED");
  });
});
```

`expectActionCalled` checks that the procedure called the action as the signed-in user.

### The team pages

A form opens an incident:

```vue
<!-- app/components/OpenIncidentForm.vue -->
<template>
  <ActionForm
    :action="$api.incident.open"
    :defaults="{ title: '', body: '' }"
    :fields="{ body: { label: 'First update' } }"
    submit-label="Open incident"
    :options="{ onSuccess: () => navigateTo({ name: 'admin' }) }"
    class="space-y-4"
  />
</template>
```

`<ActionForm>` renders the fields of `openIncidentInput`, checks the input in the browser with the same schema as the server, then calls the mutation. After a success, it goes to the list of open incidents, which shows the flash message. A second form posts an update:

```vue
<!-- app/components/PostUpdateForm.vue -->
<script setup lang="ts">
const props = defineProps<{ incident: RouterOutputs["status"]["current"][number] }>();

const statuses = Object.entries(statusLabels).map(([value, { label }]) => ({ value, label }));

const form = useActionForm($api.incident.postUpdate, {
  toast: "Update posted",
  defaults: { incidentId: props.incident.id, status: props.incident.status, body: "" },
});
</script>

<template>
  <UForm :ref="form.ref" :schema="form.schema" :state="form.state" class="space-y-4" @submit="form.submit">
    <UFormField name="status" label="Status">
      <USelect v-model="form.state.status" :items="statuses" class="w-48" />
    </UFormField>
    <UFormField name="body" label="Update">
      <UTextarea v-model="form.state.body" class="w-full" />
    </UFormField>
    <UAlert v-if="form.formError" color="error" :title="form.formError" />
    <UButton type="submit" :loading="form.pending" :label="`Post update to ${incident.title}`" />
  </UForm>
</template>
```

The `toast` option shows a toast after each success. The select starts at the current status of the incident. The button names the incident, so each form on the list has a button with its own name. Add the two pages under `/admin`:

```vue
<!-- app/pages/admin/index.vue -->
<script setup lang="ts">
definePageMeta({ layout: "app", middleware: "auth" });
useSeo({ title: "Incidents" });

const current = $api.status.current.useQuery();
</script>

<template>
  <div class="max-w-3xl space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-semibold">Open incidents</h1>
      <UButton :to="{ name: 'admin-new' }" icon="i-lucide-plus" label="New incident" />
    </div>
    <QueryState :query="current">
      <template #empty>
        <UEmpty title="No open incidents" description="All systems operational." />
      </template>
      <template #default="{ data }">
        <ul class="space-y-6">
          <li v-for="incident in data" :key="incident.id" class="space-y-4">
            <IncidentCard :incident="incident" />
            <PostUpdateForm :key="incident.updates.length" :incident="incident" />
          </li>
        </ul>
      </template>
    </QueryState>
  </div>
</template>
```

```vue
<!-- app/pages/admin/new.vue -->
<script setup lang="ts">
definePageMeta({ layout: "app", middleware: "auth" });
useSeo({ title: "New incident" });
</script>

<template>
  <div class="max-w-xl space-y-6">
    <h1 class="text-2xl font-semibold">New incident</h1>
    <OpenIncidentForm />
  </div>
</template>
```

The `auth` middleware sends a guest to the sign-in page. The update form has `:key="incident.updates.length"`. A new update changes the key, so Vue makes a new form with an empty text. Link the pages from the header of the status page:

```vue
<!-- app/layouts/home.vue -->
          <template v-if="user">
            <UButton :to="{ name: 'admin' }" color="neutral" variant="ghost" label="Manage incidents" />
```

Sign in as `demo@example.com` with the password `demo-password`. Select **Manage incidents**, then **New incident**. Open an incident, then post an update with the status **Identified**. Open `/`: the card shows both updates.

### Test the forms

```bash
./nv make:story OpenIncidentForm
./nv make:story PostUpdateForm
```

```ts
// app/components/OpenIncidentForm.stories.ts
import type { Meta, StoryObj } from "@storybook-vue/nuxt";
import { mockTrpc, trpcSpy } from "@nuxvel/nuxt/storybook/mocks";
import { button, expect, fillForm, page, text } from "@nuxvel/nuxt/storybook/test";
import OpenIncidentForm from "./OpenIncidentForm.vue";

const meta = { component: OpenIncidentForm } satisfies Meta<typeof OpenIncidentForm>;
export default meta;

const open = trpcSpy("incident.open", (input) => ({
  id: 1,
  title: input.title,
  status: "investigating",
  resolvedAt: null,
  createdAt: new Date(),
}));

export const Opens: StoryObj<typeof meta> = {
  parameters: { msw: [mockTrpc({ incident: { open } })] },
  play: async () => {
    await fillForm(page, { Title: "API is slow", "First update": "We are looking into slow responses." });
    await button(page, "Open incident").click();

    await expect(open).toHaveBeenCalledWith({ title: "API is slow", body: "We are looking into slow responses." });
  },
};

export const NeedsATitleAndABody: StoryObj<typeof meta> = {
  parameters: { msw: [mockTrpc({ incident: { open } })] },
  play: async () => {
    await button(page, "Open incident").click();

    await expect(text(page, "Name the problem")).toBeVisible();
    await expect(text(page, "Tell visitors what you know")).toBeVisible();
    await expect(open).not.toHaveBeenCalled();
  },
};
```

```ts
// app/components/PostUpdateForm.stories.ts
import type { Meta, StoryObj } from "@storybook-vue/nuxt";
import { ActionError, mockTrpc, trpcSpy } from "@nuxvel/nuxt/storybook/mocks";
import { button, expect, fillForm, page, text, toast } from "@nuxvel/nuxt/storybook/test";
import PostUpdateForm from "./PostUpdateForm.vue";

const meta = {
  component: PostUpdateForm,
  args: {
    incident: { id: 7, title: "API is slow", status: "investigating", resolvedAt: null, createdAt: new Date(), updates: [] },
  },
} satisfies Meta<typeof PostUpdateForm>;
export default meta;

const postUpdate = trpcSpy("incident.postUpdate", (input) => ({ id: 2, status: input.status, body: input.body, createdAt: new Date() }));

export const Posts: StoryObj<typeof meta> = {
  parameters: { msw: [mockTrpc({ incident: { postUpdate } })] },
  play: async () => {
    await fillForm(page, { Status: "Identified", Update: "A slow database query." });
    await button(page, "Post update to API is slow").click();

    await expect(postUpdate).toHaveBeenCalledWith({ incidentId: 7, status: "identified", body: "A slow database query." });
    await expect(toast(page, "Update posted")).toBeVisible();
  },
};

export const AlreadyResolved: StoryObj<typeof meta> = {
  parameters: {
    msw: [
      mockTrpc({
        incident: {
          postUpdate: () => {
            throw new ActionError("incident.resolved", "This incident is already resolved");
          },
        },
      }),
    ],
  },
  play: async () => {
    await fillForm(page, { Update: "Still slow?" });
    await button(page, "Post update to API is slow").click();

    await expect(text(page, "This incident is already resolved")).toBeVisible();
  },
};
```

A story has no server. `mockTrpc` answers the tRPC calls, and `trpcSpy` records each call and returns the value of its function. `fillForm` fills each field by its label: a text for an input, and the label of an option for a `USelect`. `ActionError` sends the typed failure in the shape of the real server, so `form.formError` shows its message. Run `npm run test:ui`.

## 5. Cache

When an incident starts, many visitors open the same incident page at the same time, often from the link in a mail. The history changes only when an incident is resolved. Both are values that many requests read and few requests change. Keep them in the cache:

```ts
// server/trpc/routers/status.router.ts
import { desc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { incidentTable } from "#nuxvel/schema";

export const statusRouter = {
  current: publicProcedure.output(z.array(incidentSchema)).query(async () =>
    withUpdates(
      await useDb().select().from(incidentTable).where(ne(incidentTable.status, "resolved")).orderBy(desc(incidentTable.id)),
    ),
  ),
  incident: publicProcedure
    .input(incidentIdInput)
    .output(incidentSchema)
    .query(({ input }) =>
      remember(`status:incident:${input.id}`, { minutes: 5 }, async () =>
        withUpdates([await findOrFail(incidentTable, input.id)]).then(firstOrFail),
      ),
    ),
  history: publicProcedure
    .input(paginationSchema.optional())
    .output(paginated(incidentSchema.omit({ updates: true })))
    .query(({ input }) =>
      remember(`status:history:${JSON.stringify([input?.page, input?.perPage])}`, { minutes: 5 }, () =>
        paginate(
          useDb()
            .select()
            .from(incidentTable)
            .where(eq(incidentTable.status, "resolved"))
            .orderBy(desc(incidentTable.resolvedAt), desc(incidentTable.id))
            .$dynamic(),
          { perPage: 10, ...input },
        ),
      ),
    ),
};
```

`remember(key, ttl, fn)` returns the cached value of the key. When the key is missing, it runs `fn` and keeps the result for five minutes. Each incident has its own key, and each page of the history too. The values go through superjson, so a `Date` reads back as a `Date`.

`current` stays without a cache. At startup, the test server opens `/`, so a cached `current` holds an empty list before the first test. Thus the first test that reads `current` would get a stale value.

A new update must reach the pages at once. Add `invalidates` to the two actions:

```ts
// server/actions/incidents/open-incident.action.ts
export const openIncidentAction = defineAction({
  input: openIncidentInput.extend({ monitor: z.string().max(255).optional() }),
  invalidates: ["status"],
```

```ts
// server/actions/incidents/post-update.action.ts
export const postUpdateAction = defineAction({
  input: postIncidentUpdateInput,
  invalidates: ["status"],
```

After the transaction commits, the action removes every cached value under `status`, and the client loads the `status` queries again, so the page shows the new update. When the action fails, it removes nothing. Test the cache:

```ts
// tests/functional/status-cache.test.ts
import { actingAs, expect, expectCacheHit, expectCacheMiss, expectQueryCount, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { incidentFactory, userFactory } from "#nuxvel/factories";

describe("the status cache", () => {
  it("reads an incident from the database once, then from the cache", async () => {
    const incident = await incidentFactory();

    await guest().trpc.status.incident({ id: incident.id });
    await expectQueryCount({ max: 0 }, () => guest().trpc.status.incident({ id: incident.id }));

    await expectCacheMiss(`status:incident:${incident.id}`, { times: 1 });
    await expectCacheHit(`status:incident:${incident.id}`, { times: 1 });
  });

  it("reads the incident again after an update", async () => {
    const ada = await userFactory();
    const incident = await incidentFactory();
    await guest().trpc.status.incident({ id: incident.id });

    await actingAs(ada).trpc.incident.postUpdate({ incidentId: incident.id, status: "resolved", body: "Fixed." });
    const resolved = await guest().trpc.status.incident({ id: incident.id });

    expect(resolved).toMatchObject({ status: "resolved", updates: [{ body: "Fixed." }] });
    await expectCacheMiss(`status:incident:${incident.id}`, { times: 2 });
  });

  it("keeps one cached value for each page of the history", async () => {
    await guest().trpc.status.history({ page: 1 });
    await guest().trpc.status.history({ page: 2 });
    await guest().trpc.status.history({ page: 1 });

    await expectCacheMiss("status:history:[1,null]", { times: 1 });
    await expectCacheMiss("status:history:[2,null]", { times: 1 });
    await expectCacheHit("status:history:[1,null]", { times: 1 });
  });
});
```

`expectCacheMiss` and `expectCacheHit` count the lookups of one key. `expectQueryCount({ max: 0 })` proves that the second read runs no query. The key of the history page is the JSON of `[page, perPage]`, so a call without `perPage` has the key `status:history:[1,null]`. Run `./nv test tests/functional/status-cache.test.ts`.

See [Cache](../cache.md).

## 6. Subscribers and mail

A visitor subscribes with an email address. Each update then goes to each subscriber by mail.

### Subscribe

```bash
./nv make:action subscribers/subscribe
./nv make:router subscriber
rm server/actions/subscribers/subscribe.action.test.ts
```

```ts
// server/actions/subscribers/subscribe.action.ts
import { subscriberTable } from "#nuxvel/schema";

export const subscribeAction = defineAction({
  input: subscribeInput,
  handler: async ({ email }) => {
    await useDb().insert(subscriberTable).values({ email }).onConflictDoNothing();
  },
});
```

```ts
// server/trpc/routers/subscriber.router.ts
import { z } from "zod";
import { subscribeAction } from "#server/actions/subscribers/subscribe.action";

export const subscriberRouter = {
  subscribe: publicProcedure
    .input(subscribeInput)
    .output(z.void())
    .mutation(({ input }) => subscribeAction(input, { actor: systemActor("subscribe-form") })),
};
```

`onConflictDoNothing()` keeps the first row when an address subscribes again. A visitor has no account, so the router calls the action as `systemActor("subscribe-form")`. `.output(z.void())` says that the procedure sends nothing to the browser. `nuxvel test:arch` refuses a procedure without an output schema. The router test replaces the generated action test:

```ts
// server/trpc/routers/subscriber.router.test.ts
import { expect, expectCount, expectRow, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { subscriberTable } from "#nuxvel/schema";

describe("subscriber router", () => {
  it("subscribes an email once, also when it is sent two times", async () => {
    await guest().trpc.subscriber.subscribe({ email: "reader@example.com" });
    await guest().trpc.subscriber.subscribe({ email: "reader@example.com" });

    await expectRow(subscriberTable, { email: "reader@example.com" });
    await expectCount(subscriberTable, 1);
  });

  it("refuses a value that is not an email", async () => {
    await expect(guest().trpc.subscriber.subscribe({ email: "reader" })).rejects.toHaveValidationErrors({
      email: "Enter an email address",
    });
  });
});
```

The form goes on the status page:

```vue
<!-- app/components/SubscribeForm.vue -->
<script setup lang="ts">
const form = useActionForm($api.subscriber.subscribe, {
  toast: "You will get a mail for each update",
  defaults: { email: "" },
});
</script>

<template>
  <UForm :ref="form.ref" :schema="form.schema" :state="form.state" class="flex items-start gap-2" @submit="form.submit">
    <UFormField name="email" label="Get updates by mail" class="w-72">
      <UInput v-model="form.state.email" type="email" autocomplete="email" class="w-full" />
    </UFormField>
    <UButton type="submit" class="mt-6" :loading="form.pending" label="Subscribe" />
  </UForm>
</template>
```

```vue
<!-- app/pages/index.vue -->
    <ULink :to="{ name: 'history' }" class="text-sm font-medium text-primary">Past incidents</ULink>
    <SubscribeForm />
```

```bash
./nv make:story SubscribeForm
```

```ts
// app/components/SubscribeForm.stories.ts
import type { Meta, StoryObj } from "@storybook-vue/nuxt";
import { mockTrpc, trpcSpy } from "@nuxvel/nuxt/storybook/mocks";
import { button, expect, field, page, text, toast } from "@nuxvel/nuxt/storybook/test";
import SubscribeForm from "./SubscribeForm.vue";

const meta = { component: SubscribeForm } satisfies Meta<typeof SubscribeForm>;
export default meta;

const subscribe = trpcSpy("subscriber.subscribe", () => undefined);

export const Subscribes: StoryObj<typeof meta> = {
  parameters: { msw: [mockTrpc({ subscriber: { subscribe } })] },
  play: async () => {
    await field(page, "Get updates by mail").fill("reader@example.com");
    await button(page, "Subscribe").click();

    await expect(subscribe).toHaveBeenCalledWith({ email: "reader@example.com" });
    await expect(toast(page, "You will get a mail for each update")).toBeVisible();
  },
};

export const RefusesAnInvalidEmail: StoryObj<typeof meta> = {
  parameters: { msw: [mockTrpc({ subscriber: { subscribe } })] },
  play: async () => {
    await field(page, "Get updates by mail").fill("reader");
    await button(page, "Subscribe").click();

    await expect(text(page, "Enter an email address")).toBeVisible();
    await expect(subscribe).not.toHaveBeenCalled();
  },
};
```

### The mail

```bash
./nv make:mail incident.update
```

The command writes the mail, a template in `<MailLayout>` and a test. `<MailLayout>` gives one white card. This mail shows the status in a colored band above the card, so it uses the MJML sections itself. Replace the template:

```vue
<!-- server/mail/incident/templates/IncidentUpdate.vue -->
<script setup lang="ts">
defineProps<{ title: string; status: "investigating" | "identified" | "monitoring" | "resolved"; body: string; url: string }>();

const bands = {
  investigating: { label: "Investigating", color: "#b91c1c" },
  identified: { label: "Identified", color: "#b45309" },
  monitoring: { label: "Monitoring", color: "#1d4ed8" },
  resolved: { label: "Resolved", color: "#15803d" },
};
</script>

<template>
  <EHtml>
    <EHead>
      <EPreview>{{ bands[status].label }}: {{ title }}</EPreview>
    </EHead>
    <EBody background-color="#f3f4f6">
      <ESection :background-color="bands[status].color" padding="12px 24px">
        <EColumn>
          <EText color="#ffffff" font-size="14px" font-weight="bold">{{ bands[status].label }}</EText>
        </EColumn>
      </ESection>
      <ESection background-color="#ffffff" padding="24px">
        <EColumn>
          <EHeading>{{ title }}</EHeading>
          <EText font-size="16px" line-height="24px">{{ body }}</EText>
          <EButton :href="url" background-color="#111827" border-radius="6px">Follow the incident</EButton>
        </EColumn>
      </ESection>
      <ESection padding="16px 24px">
        <EColumn>
          <EText font-size="12px" color="#6b7280">You get this mail because you subscribed to our status page.</EText>
        </EColumn>
      </ESection>
    </EBody>
  </EHtml>
</template>
```

Many mail clients do not show a `<div>` layout correctly. Each `E` component renders one MJML tag, and MJML changes the tags to HTML tables with inline styles. A section is a row of the mail. Each section needs a column, and each text goes in a column. Set the styles with MJML attributes, such as `background-color` and `font-size`, not with classes. A template without `<MailLayout>` renders `<EHtml>`, `<EHead>` and `<EBody>` itself. Then the mail:

```ts
// server/mail/incident/update.mail.ts
import { h } from "vue";
import { z } from "zod";
import IncidentUpdate from "./templates/IncidentUpdate.vue";

export const incidentUpdateMail = defineMail({
  input: z.object({ to: z.email(), title: z.string(), status: incidentStatus, body: z.string(), url: z.url() }),
  subject: ({ title, status }) => (status === "resolved" ? `Resolved: ${title}` : `Incident: ${title}`),
  render: (props) => h(IncidentUpdate, props),
  preview: () => ({
    to: "reader@example.com",
    title: "API is slow",
    status: "identified",
    body: "A slow database query. We are deploying a fix.",
    url: "https://status.example.com/incidents/7",
  }),
});
```

`input` is the schema of the data that the mail needs. `to` is the recipient, and `render` gets the input without it. `preview` is the input that the mail preview of the DevTools starts with. Test the mail:

```ts
// server/mail/incident/update.mail.test.ts
import { expect, renderMail } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";

const update = {
  to: "reader@example.com",
  title: "API is slow",
  body: "A slow database query. We are deploying a fix.",
  url: "https://status.example.com/incidents/7",
};

describe("incident.update mail", () => {
  it("shows the status in a colored band, the update and a link", async () => {
    const { subject, html, text } = await renderMail("incident.update", { ...update, status: "identified" });

    expect(subject).toBe("Incident: API is slow");
    expect(html).toContain("background:#b45309");
    expect(html).toContain("<!--[if mso");
    expect(text).toContain("Identified");
    expect(text).toContain("A slow database query. We are deploying a fix.");
    expect(text).toContain("Follow the incident https://status.example.com/incidents/7");
  });

  it("says resolved in the subject of the last update", async () => {
    const { subject } = await renderMail("incident.update", { ...update, status: "resolved" });

    expect(subject).toBe("Resolved: API is slow");
  });

  it("refuses a link that is not a URL", async () => {
    await expect(
      renderMail("incident.update", { ...update, status: "identified", url: "/incidents/7" }),
    ).rejects.toHaveValidationErrors({ url: expect.any(String) });
  });
});
```

`renderMail()` renders the mail in the app and sends nothing. MJML writes the band color as an inline style, `background:#b45309`. The `<!--[if mso` markup is the fallback for Outlook on desktop. Each mail also has a text version, which nuxvel makes from the HTML.

### The job

The mail goes out from a job, after the update commits:

```bash
./nv make:job incident.announce update_id:integer
```

```ts
// server/jobs/incident/announce.job.ts
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { incidentTable, incidentUpdateTable, subscriberTable } from "#nuxvel/schema";

export const incidentAnnounceJob = defineJob({
  input: z.object({
    updateId: z.number().int(),
  }),
  handler: ({ updateId }) =>
    transaction(async () => {
      const [update] = await useDb()
        .update(incidentUpdateTable)
        .set({ announcedAt: now() })
        .where(and(eq(incidentUpdateTable.id, updateId), isNull(incidentUpdateTable.announcedAt)))
        .returning();
      if (!update) return;

      const incident = await findOrFail(incidentTable, update.incidentId);
      const url = new URL(`/incidents/${incident.id}`, useRuntimeConfig().siteUrl).href;
      const subscribers = await useDb().select().from(subscriberTable);

      for (const subscriber of subscribers) {
        await $mails.incident.update.send({ to: subscriber.email, title: incident.title, status: update.status, body: update.body, url });
      }
    }),
});
```

The queue can run a job two times, for example after a worker stops in the middle of a job. This job is safe to run again:

1. The `update` marks the update as announced, but only when `announcedAt` is `null`. A second run gets no row and returns.
2. `$mails.x.send()` does not connect to the mail server. It renders the mail and dispatches the built-in `nuxvel.mail` job after the commit.
3. The mark and the mail jobs commit in one transaction. When the job fails before the commit, it sends no mail and keeps no mark. The retry starts again from the beginning.

The link in the mail must be a full URL. `useRuntimeConfig().siteUrl` is the public origin of the app. `npm run dev` sets `NUXT_SITE_URL` to the URL that it prints, for example `https://status-page.localhost`. A `NUXT_SITE_URL` in the shell or in `.env` wins.

Dispatch the job from the two actions. `$jobs.incident.announce.dispatch()` takes the typed input of the job:

```ts
// server/actions/incidents/post-update.action.ts
import { eq } from "drizzle-orm";
import { incidentTable, incidentUpdateTable } from "#nuxvel/schema";

export const postUpdateAction = defineAction({
  input: postIncidentUpdateInput,
  invalidates: ["status"],
  errors: {
    "incident.resolved": "This incident is already resolved",
  },
  handler: async ({ incidentId, status, body }, _ctx, fail) => {
    const incident = await findOrFail(incidentTable, incidentId);
    if (incident.status === "resolved") return fail("incident.resolved");

    await useDb()
      .update(incidentTable)
      .set({ status, resolvedAt: status === "resolved" ? now() : null })
      .where(eq(incidentTable.id, incidentId));

    const update = await insertOne(incidentUpdateTable, { incidentId, status, body });

    await $jobs.incident.announce.dispatch({ updateId: update.id });

    return update;
  },
});
```

```ts
// server/actions/incidents/open-incident.action.ts
    const update = await insertOne(incidentUpdateTable, { incidentId: incident.id, status: "investigating", body });

    await $jobs.incident.announce.dispatch({ updateId: update.id });
```

`dispatch()` does not write to Redis. It writes a row to the `outbox` table, in the transaction of the action. The worker moves the row to the queue after the commit. So the queue always agrees with the database:

- When the action rolls back, for example on `fail("incident.resolved")`, no row and no job remain.
- When the process stops between the commit and the queue, the next relay finds the row.

See [Queues: the outbox](../queues.md#the-outbox). Test the job:

```ts
// server/jobs/incident/announce.job.test.ts
import { expect, expectMailSent, expectNoMailSent, expectRow, renderMail, runJob } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { incidentUpdateTable } from "#nuxvel/schema";
import { incidentFactory, incidentUpdateFactory, subscriberFactory } from "#nuxvel/factories";

describe("incident.announce job", () => {
  it("mails the update to each subscriber and marks it announced", async () => {
    const incident = await incidentFactory({ title: "API is slow" });
    const update = await incidentUpdateFactory.for("incidentId", incident)({ status: "identified", body: "A slow query." });
    const [ada, grace] = await subscriberFactory.count(2)();

    await runJob("incident.announce", { updateId: update.id });

    await expectMailSent("incident.update", { to: ada?.email, title: "API is slow", status: "identified" });
    const sent = await expectMailSent("incident.update", { to: grace?.email });
    expect(sent.url).toMatch(new RegExp(`/incidents/${incident.id}$`));
    expect((await renderMail("incident.update", sent)).text).toContain("A slow query.");
    const announced = await expectRow(incidentUpdateTable, { id: update.id });
    expect(announced.announcedAt).toBeInstanceOf(Date);
  });

  it("sends nothing for an update that went out before", async () => {
    const update = await incidentUpdateFactory({ announcedAt: new Date() });
    await subscriberFactory();

    await runJob("incident.announce", { updateId: update.id });

    await expectNoMailSent("incident.update");
  });
});
```

`runJob()` runs the handler in the app now, without the queue. `expectMailSent()` checks a mail that the code sent, after its transaction committed, and returns its input. `renderMail()` then renders that input. Add the queue to the action tests. In `open-incident.action.test.ts`, the first test now checks the job:

```ts
// server/actions/incidents/open-incident.action.test.ts
    const update = await expectRow(incidentUpdateTable, { incidentId: incident.id, status: "investigating", body: "We are looking into slow responses." });
    await expectQueued("incident.announce", { updateId: update.id }, { times: 1 });
```

```ts
// server/actions/incidents/post-update.action.test.ts
import { expect, expectNotQueued, expectQueued, expectRow, freezeTime, runAction } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { incidentTable } from "#nuxvel/schema";
import { incidentFactory, resolvedIncidentFactory, userFactory } from "#nuxvel/factories";

describe("incidents/post-update action", () => {
  it("adds an update and moves the incident to its status", async () => {
    const ada = await userFactory();
    const incident = await incidentFactory();

    const update = await runAction("incidents.post-update", { incidentId: incident.id, status: "identified", body: "A slow query." }, { actingAs: ada });

    await expectRow(incidentTable, { id: incident.id, status: "identified", resolvedAt: null });
    await expectQueued("incident.announce", { updateId: update.id });
  });

  it("stamps the time of a resolve", async () => {
    const ada = await userFactory();
    const incident = await incidentFactory();
    const resolvedAt = await freezeTime(new Date("2026-10-01T09:30:00Z"));

    await runAction("incidents.post-update", { incidentId: incident.id, status: "resolved", body: "Fixed." }, { actingAs: ada });

    await expectRow(incidentTable, { id: incident.id, status: "resolved", resolvedAt });
  });

  it("refuses an update on a resolved incident", async () => {
    const ada = await userFactory();
    const incident = await resolvedIncidentFactory();

    await expect(
      runAction("incidents.post-update", { incidentId: incident.id, status: "monitoring", body: "Again?" }, { actingAs: ada }),
    ).rejects.toBeActionError("incident.resolved");
    await expectNotQueued("incident.announce");
  });
});
```

`expectQueued()` relays the outbox and checks the job on the queue. `expectNotQueued()` proves that the failed action dispatched nothing. Run the tests:

```bash
./nv test server/jobs server/mail server/actions server/trpc
npm run test:ui
```

### See it work

`npm run dev` runs the queue worker in the dev server. Subscribe on `/` with an email, then post an update on `/admin`. Open Mailpit at <http://localhost:8025>: the mail shows the status band and a **Follow the incident** button.

See [Mail](../mail.md) and [Queues](../queues.md).

## 7. Tell the team

When an incident opens, the rest of the team must know at once. A notification goes to the bell in the header of each member.

```bash
./nv make:notification incident.opened
```

```ts
// server/notifications/incident/opened.notification.ts
import { z } from "zod";

export const incidentOpenedNotification = defineNotification({
  schema: z.object({ title: z.string() }),
  via: ["database"],
  toDatabase: ({ title }) => ({ title: "Incident opened", body: title, url: "/admin", icon: "i-lucide-siren" }),
});
```

`via: ["database"]` writes one row to the `notifications` table for each user. `toDatabase` gives the text of the row and the page that a click opens. The `<NotificationBell>` of the starter layouts shows the rows without a reload. Send the notification from the open action:

```ts
// server/actions/incidents/open-incident.action.ts
import { ne } from "drizzle-orm";
import { z } from "zod";
import { userTable, incidentTable, incidentUpdateTable } from "#nuxvel/schema";

export const openIncidentAction = defineAction({
  input: openIncidentInput.extend({ monitor: z.string().max(255).optional() }),
  invalidates: ["status"],
  handler: async ({ title, body, monitor }, ctx) => {
    const incident = await insertOne(incidentTable, { title, monitor });
    const update = await insertOne(incidentUpdateTable, { incidentId: incident.id, status: "investigating", body });

    await $jobs.incident.announce.dispatch({ updateId: update.id });

    const team = await useDb().select({ id: userTable.id }).from(userTable).where(ne(userTable.id, ctx.actor.id));
    await $notifications.incident.opened.notify(team.map((member) => member.id), { title });

    return incident;
  },
});
```

The query leaves out the member who opened the incident. `$notifications.x.notify()` writes the rows in the transaction of the action, so a rolled-back action notifies nobody. Test the notification and the action:

```ts
// server/notifications/incident/opened.notification.test.ts
import { expectNotified, sendNotification } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { userFactory } from "#nuxvel/factories";

describe("incident.opened notification", () => {
  it("reaches the user through the database channel, with a link to the open incidents", async () => {
    const recipient = await userFactory();

    await sendNotification(recipient, "incident.opened", { title: "API is slow" });

    await expectNotified(recipient, "incident.opened", { title: "Incident opened", body: "API is slow", url: "/admin" });
  });
});
```

```ts
// server/actions/incidents/open-incident.action.test.ts
  it("tells the rest of the team", async () => {
    const ada = await userFactory();
    const grace = await userFactory();

    await runAction("incidents.open-incident", { title: "API is slow", body: "Slow responses." }, { actingAs: ada });

    await expectNotified(grace, "incident.opened", { body: "API is slow" });
    await expectNotNotified(ada, "incident.opened");
  });
```

`sendNotification()` tests the notification apart from the code that sends it. Run `./nv test server/notifications server/actions`. See [Notifications](../notifications.md).

## 8. The monitor webhook

The company uses an uptime monitor. When a check changes state, the monitor posts an event to a URL of the app. It signs the body with a shared secret and puts the hex HMAC-SHA256 in the `x-signature` header. It sends the event again when the app does not answer `200`.

```bash
./nv make:webhook monitor
```

The command writes `server/webhooks/monitor.webhook.ts`, which answers at `POST /api/webhooks/monitor`, and its test. Replace the webhook:

```ts
// server/webhooks/monitor.webhook.ts
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { openIncidentAction } from "#server/actions/incidents/open-incident.action";
import { postUpdateAction } from "#server/actions/incidents/post-update.action";
import { incidentTable } from "#nuxvel/schema";

export const monitorWebhook = defineWebhook({
  payload: z.object({ id: z.string(), check: z.string().min(1).max(100), state: z.enum(["down", "up"]) }),
  verify: hmac({ header: "x-signature", secret: "NUXT_MONITOR_WEBHOOK_SECRET" }),
  eventId: ({ payload }) => payload.id,
  handler: ({ payload: { check, state } }) =>
    withLock(`monitor:${check}`, 30, async () => {
      const actor = systemActor("monitor");
      const [open] = await useDb()
        .select()
        .from(incidentTable)
        .where(and(eq(incidentTable.monitor, check), ne(incidentTable.status, "resolved")));

      if (state === "down" && !open) {
        await openIncidentAction(
          { title: `${check} is down`, body: `Our monitor reports that ${check} does not answer. We are looking into it.`, monitor: check },
          { actor },
        );
      }

      if (state === "up" && open) {
        await postUpdateAction(
          { incidentId: open.id, status: "resolved", body: `Our monitor reports that ${check} answers again.` },
          { actor },
        );
      }
    }),
});
```

nuxvel checks each delivery in this order:

1. `verify` checks the signature. `hmac()` reads the secret from `NUXT_MONITOR_WEBHOOK_SECRET`. A bad signature gets `401`.
2. `payload` checks the JSON. A body that fails gets `400`.
3. `eventId` gives the ID of the event. nuxvel runs the handler one time for each ID. A repeat of a handled event gets `200` and does not run the handler.

The handler opens an incident when a check goes down and has no open incident. It resolves the open incident when the check is up again. It calls the same actions as the team, as `systemActor("monitor")`. So the incident gets its first update, the mail job and the notification.

`withLock()` runs the handler for one check at a time. Two events for the same check at the same moment can otherwise both find no open incident and open two. While the lock is held, a second delivery gets `409`, and the monitor sends it again later.

Set the secret in `.env`. Use the value that the monitor gives you:

```
NUXT_MONITOR_WEBHOOK_SECRET=change-me-to-a-long-random-value
```

Replace the generated test:

```ts
// server/webhooks/monitor.webhook.test.ts
import { deliverWebhook, expect, expectCount, expectQueued, expectRow, guest } from "@nuxvel/nuxt/testing";
import { randomUUID } from "node:crypto";
import { describe, it } from "vitest";
import { incidentTable } from "#nuxvel/schema";
import { incidentFactory } from "#nuxvel/factories";

process.env.NUXT_MONITOR_WEBHOOK_SECRET = "monitor-webhook-test-secret";

describe("monitor webhook", () => {
  it("opens an incident when a check goes down", async () => {
    const response = await deliverWebhook("monitor", { id: randomUUID(), check: "API", state: "down" });

    expect(response.status).toBe(200);
    const incident = await expectRow(incidentTable, { monitor: "API", status: "investigating", title: "API is down" });
    await expectQueued("incident.announce");
    expect(incident.resolvedAt).toBeNull();
  });

  it("opens one incident for a delivery that the monitor sends again", async () => {
    const event = { id: randomUUID(), check: "API", state: "down" as const };

    await deliverWebhook("monitor", event);
    const again = await deliverWebhook("monitor", event);

    expect(again.status).toBe(200);
    await expectCount(incidentTable, 1);
  });

  it("opens no second incident while the first one is open", async () => {
    await incidentFactory({ monitor: "API" });

    await deliverWebhook("monitor", { id: randomUUID(), check: "API", state: "down" });

    await expectCount(incidentTable, 1);
  });

  it("resolves the open incident of the check when it is up again", async () => {
    const incident = await incidentFactory({ monitor: "API" });

    await deliverWebhook("monitor", { id: randomUUID(), check: "API", state: "up" });

    await expectRow(incidentTable, { id: incident.id, status: "resolved" });
  });

  it("rejects a signed delivery that does not match the payload schema", async () => {
    const response = await deliverWebhook("monitor", { id: randomUUID(), check: "API", state: "sideways" });

    expect(response.status).toBe(400);
  });

  it("rejects a delivery with a bad signature", async () => {
    const response = await guest().fetch("/api/webhooks/monitor", {
      method: "POST",
      headers: { "content-type": "application/json", "x-signature": "not-a-signature" },
      body: JSON.stringify({ id: randomUUID(), check: "API", state: "down" }),
    });

    expect(response.status).toBe(401);
    await expectCount(incidentTable, 0);
  });
});
```

Set the secret in `process.env` at the top of the file, before the app starts. `deliverWebhook()` signs the body with that secret and posts it to the real endpoint. Each call is a new delivery, so the second test sends the same event two times. Run `./nv test server/webhooks`.

### See it work

Send a signed event from the terminal while `npm run dev` runs:

```bash
body='{"id":"evt_1","check":"API","state":"down"}'
sig=$(printf '%s' "$body" | openssl dgst -sha256 -hmac "change-me-to-a-long-random-value" | sed 's/^.* //')
curl -X POST https://status-page.localhost/api/webhooks/monitor -H 'content-type: application/json' -H "x-signature: $sig" -d "$body"
```

```json
{
  "received": true
}
```

`/` shows the incident **API is down**, and the subscriber gets a mail. Send the same command again: the answer is the same, and no second incident opens. Change `"down"` to `"up"` and the ID to `evt_2`: the incident is resolved, and the subscriber gets a mail with the subject `Resolved: API is down`. See [Webhooks](../webhooks.md).

## 9. A switch for the monitor

A monitor can report a false alarm, for example during a network problem of the monitor itself. The team then needs to stop the automatic incidents, without a deploy. A feature flag does this:

```bash
./nv make:flag monitor-incidents
```

The generated flag is off by default. The monitor must open incidents until the team stops it, so turn it on:

```ts
// server/flags/monitor-incidents.flag.ts
export const monitorIncidentsFlag = defineFlag({ default: true });
```

Read the flag at the start of the handler:

```ts
// server/webhooks/monitor.webhook.ts
  handler: async ({ payload: { check, state } }) => {
    if (!(await flag("monitor-incidents"))) return;

    await withLock(`monitor:${check}`, 30, async () => {
```

While the flag is off, the handler returns. The delivery gets `200`, so the monitor does not send it again. Turn the flag off and on from the terminal. The change applies in each server process at the next evaluation:

```bash
./nv flags:set monitor-incidents --value false
./nv flags:list
```

```
NAME               KIND  DEFAULT  TARGETING  STATUS
monitor-incidents  flag  true     0%         -
```

```bash
./nv flags:set monitor-incidents --value true
```

Add a test to the webhook test, before the test of the schema:

```ts
// server/webhooks/monitor.webhook.test.ts
  it("accepts the delivery but opens nothing while the flag is off", async () => {
    await disableFlag("monitor-incidents");

    const response = await deliverWebhook("monitor", { id: randomUUID(), check: "API", state: "down" });

    expect(response.status).toBe(200);
    await expectCount(incidentTable, 0);
  });
```

`disableFlag()` sets the flag to 0% in the app under test. Each test starts with no targeting, so the other tests see the default, `true`.

The team must see that the monitor is stopped. Show an alert on `/admin`:

```vue
<!-- app/components/MonitorPausedAlert.vue -->
<script setup lang="ts">
const monitorIncidents = useFlag("monitor-incidents");
</script>

<template>
  <UAlert
    v-if="!monitorIncidents"
    color="warning"
    variant="subtle"
    icon="i-lucide-pause"
    title="The monitor opens no incidents"
    description="Open and resolve incidents by hand until the flag monitor-incidents is on again."
  />
</template>
```

```vue
<!-- app/pages/admin/index.vue -->
      <UButton :to="{ name: 'admin-new' }" icon="i-lucide-plus" label="New incident" />
    </div>
    <MonitorPausedAlert />
```

`useFlag()` returns the value for the current user. The server renders the page with the value, and the page updates without a reload when the flag changes. A story has no server, so it answers `GET /api/flags` with an MSW handler:

```bash
./nv make:story MonitorPausedAlert
```

```ts
// app/components/MonitorPausedAlert.stories.ts
import type { Meta, StoryObj } from "@storybook-vue/nuxt";
import { http, HttpResponse } from "msw";
import { expect, page, text } from "@nuxvel/nuxt/storybook/test";
import MonitorPausedAlert from "./MonitorPausedAlert.vue";

const meta = { component: MonitorPausedAlert } satisfies Meta<typeof MonitorPausedAlert>;
export default meta;

const flags = (on: boolean) =>
  http.get("*/api/flags", () => HttpResponse.json({ subject: null, flags: { "monitor-incidents": on }, experiments: {} }));

export const Paused: StoryObj<typeof meta> = {
  parameters: { msw: [flags(false)] },
  play: async () => {
    await expect(text(page, "The monitor opens no incidents")).toBeVisible();
  },
};

export const Running: StoryObj<typeof meta> = {
  parameters: { msw: [flags(true)] },
  play: async () => {
    await expect(text(page, "The monitor opens no incidents")).toBeHidden();
  },
};
```

Run `./nv test server/webhooks` and `npm run test:ui`. See [Feature flags](../flags.md).

## 10. A reminder for silent incidents

Visitors lose trust when an open incident has no news for a long time. A schedule reminds the team of each open incident with no update for an hour:

```bash
./nv make:schedule incidents.remind-stale
./nv make:notification incident.stale
```

```ts
// server/notifications/incident/stale.notification.ts
import { z } from "zod";

export const incidentStaleNotification = defineNotification({
  schema: z.object({ title: z.string() }),
  via: ["database"],
  toDatabase: ({ title }) => ({ title: "No update for an hour", body: title, url: "/admin", icon: "i-lucide-clock-alert" }),
});
```

```ts
// server/notifications/incident/stale.notification.test.ts
import { expectNotified, sendNotification } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { userFactory } from "#nuxvel/factories";

describe("incident.stale notification", () => {
  it("reaches the user through the database channel", async () => {
    const recipient = await userFactory();

    await sendNotification(recipient, "incident.stale", { title: "API is slow" });

    await expectNotified(recipient, "incident.stale", { title: "No update for an hour", body: "API is slow" });
  });
});
```

```ts
// server/schedules/incidents/remind-stale.schedule.ts
import { and, eq, gt, ne, notExists } from "drizzle-orm";
import { userTable, incidentTable, incidentUpdateTable } from "#nuxvel/schema";

const STALE_AFTER_MS = 60 * 60 * 1000;

export const incidentsRemindStaleSchedule = defineSchedule({
  every: { minutes: 30 },
  handler: async () => {
    const since = new Date(now().getTime() - STALE_AFTER_MS);
    const stale = await useDb()
      .select({ title: incidentTable.title })
      .from(incidentTable)
      .where(
        and(
          ne(incidentTable.status, "resolved"),
          notExists(
            useDb()
              .select()
              .from(incidentUpdateTable)
              .where(and(eq(incidentUpdateTable.incidentId, incidentTable.id), gt(incidentUpdateTable.createdAt, since))),
          ),
        ),
      );
    const team = await useDb().select({ id: userTable.id }).from(userTable);

    await transaction(async () => {
      for (const { title } of stale) {
        await $notifications.incident.stale.notify(team.map((member) => member.id), { title });
      }
    });
  },
});
```

`every: { minutes: 30 }` runs the schedule at :00 and :30 of each hour. The query finds the open incidents with no update after `since`. `now()` is the clock of the app, which the tests move. A schedule gets no transaction, so `transaction()` commits the notifications together. The reminder comes again every 30 minutes until a member posts an update. The worker registers the schedule when it starts:

```bash
./nv schedule:list
```

```
NAME                              RUNS              NEXT RUN                  NOTE
incidents.remind-stale            every 30 minutes  2026-10-02T23:00:00.000Z
nuxvel.prune-outbox               04:30 every day   2026-10-03T17:30:00.000Z
nuxvel.auth.reencrypt-two-factor  04:15 every day   2026-10-03T17:15:00.000Z
```

`make:schedule` writes no test. Write one:

```ts
// server/schedules/incidents/remind-stale.schedule.test.ts
import { expectNotNotified, expectNotified, freezeTime, runSchedule, travelBy } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { incidentFactory, resolvedIncidentFactory, incidentUpdateFactory, userFactory } from "#nuxvel/factories";

describe("incidents.remind-stale schedule", () => {
  it("reminds the team of an open incident with no update for an hour", async () => {
    await freezeTime(new Date("2026-10-01T09:00:00Z"));
    const ada = await userFactory();
    await incidentUpdateFactory.for("incidentId", await incidentFactory({ title: "API is slow" }))();

    await travelBy({ minutes: 61 });
    await runSchedule("incidents.remind-stale");

    await expectNotified(ada, "incident.stale", { body: "API is slow" });
  });

  it("stays quiet while the last update is recent", async () => {
    await freezeTime(new Date("2026-10-01T09:00:00Z"));
    const ada = await userFactory();
    await incidentUpdateFactory.for("incidentId", await incidentFactory())();

    await travelBy({ minutes: 59 });
    await runSchedule("incidents.remind-stale");

    await expectNotNotified(ada, "incident.stale");
  });

  it("stays quiet for a resolved incident", async () => {
    await freezeTime(new Date("2026-10-01T09:00:00Z"));
    const ada = await userFactory();
    await incidentUpdateFactory.for("incidentId", await resolvedIncidentFactory())();

    await travelBy({ minutes: 61 });
    await runSchedule("incidents.remind-stale");

    await expectNotNotified(ada, "incident.stale");
  });
});
```

`freezeTime()` stops the clock. The factories run in the test process, and their `createdAt` gets the frozen time too. `travelBy()` moves the clock forward, and `runSchedule()` runs one tick now, without the worker. Run `./nv test server/schedules`. See [Queues: schedules](../queues.md#schedules) and [Testing: controlling time](../testing.md#controlling-time).

## 11. Browser tests

The functional tests check the server, and the stories check each component. An end-to-end test checks a journey across pages, with a real server, a real database and a real session:

```ts
// tests/e2e/incidents.test.ts
import { actingAs, button, expect, expectMailSent, expectRow, fillForm, field, heading, link, text, toast, visit, workQueue } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { subscriberTable } from "#nuxvel/schema";
import { resolvedIncidentFactory, subscriberFactory, userFactory } from "#nuxvel/factories";

describe("incidents in a browser", () => {
  it("opens an incident, posts an update and mails the subscribers a link to it", async () => {
    const reader = await subscriberFactory();

    const page = await actingAs(await userFactory()).visit({ name: "admin" });
    await expect(text(page, "No open incidents")).toBeVisible();
    await link(page, "New incident").click();
    await fillForm(page, { Title: "API is slow", "First update": "We are looking into slow responses." });
    await button(page, "Open incident").click();
    await expect(toast(page, "Incident opened")).toBeVisible();

    await fillForm(page, { Status: "Identified", Update: "A slow database query. We are deploying a fix." });
    await button(page, "Post update to API is slow").click();
    await expect(toast(page, "Update posted")).toBeVisible();
    await expect(field(page, "Update")).toHaveValue("");

    await workQueue();
    const { url } = await expectMailSent("incident.update", { to: reader.email, status: "identified" });
    const mailPage = await visit(url);
    await expect(heading(mailPage, "API is slow")).toBeVisible();
    await expect(text(mailPage, "A slow database query. We are deploying a fix.")).toBeVisible();
  });

  it("lets a visitor subscribe and page through the past incidents", async () => {
    await resolvedIncidentFactory.count(12)();

    const page = await visit({ name: "index" });
    await expect(text(page, "All systems operational")).toBeVisible();
    await fillForm(page, { "Get updates by mail": "reader@example.com" });
    await button(page, "Subscribe").click();
    await expect(toast(page, "You will get a mail for each update")).toBeVisible();
    await expectRow(subscriberTable, { email: "reader@example.com" });

    await link(page, "Past incidents").click();
    await expect(heading(page, "Past incidents")).toBeVisible();
    const incidents = page.getByRole("row").filter({ has: page.getByRole("cell") });
    await expect(incidents).toHaveCount(10);
    await link(page, "Page 2").click();
    await expect(incidents).toHaveCount(2);
  });
});
```

- `actingAs(user).visit()` opens a page as a signed-in user. `visit()` opens it as a guest. A route location such as `{ name: "admin" }` is typed, so a renamed page fails the typecheck.
- `workQueue()` runs the jobs in the queue, here `incident.announce`. It does not deliver the mail, so `expectMailSent()` reads the mail from the queue.
- `visit(url)` opens the link of the mail on the app under test.
- The table has an empty row under its header, so the test counts only the rows with cells.
- `visit()` fails the test on a page error, a failed request or a response of 500 or more.

```bash
npm run test:e2e
```

## 12. Run all the checks

```bash
npm run typecheck
npm run test:functional
npm run test:ui
npm run test:e2e
npm run test:arch
```

```
 Test Files  17 passed (17)
      Tests  44 passed (44)
```

```
 Test Files  7 passed (7)
      Tests  13 passed (13)
```

```
 Test Files  2 passed (2)
      Tests  6 passed (6)
```

```
✔ All architecture rules pass
```

`npm test` runs `test:functional`, then `test:ui`. `test:arch` checks the architecture rules. One of them refuses a procedure without an `.output()` schema, see [chapter 6](#subscribe). Another refuses a functional test that reads the HTML of a page, and an `expect` that does not come from the nuxvel entries. See [CLI: test:arch](../cli.md#nuxvel-testarch).

## What this tutorial leaves out

- **The team.** Each account is a member of the team, and anyone can sign up. A real status page closes the sign-up and gives the team a role. See [Authorization](../authorization.md).
- **Unsubscribe and double opt-in.** A subscriber cannot leave, and nobody confirms the address. Add a token to the subscriber row, a link with it in the mail, and an action that deletes the row.
- **Many subscribers.** The job sends all the mails in one transaction. For thousands of subscribers, dispatch one job for each batch of subscribers.
- **Components.** The status page shows incidents, not the state of each component of the product.
- **Web push and realtime.** Other tutorials cover them.
