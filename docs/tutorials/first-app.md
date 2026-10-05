# Tutorial: your first nuxvel app

## Introduction

This tutorial builds Gather, a small app for event invitations. A signed-in host creates an event and invites guests by mail. A guest opens the link in the mail and answers yes or no. The host sees the guest list.

Each chapter adds one part, and the app works at the end of each chapter:

1. Create the app and start it.
2. Generate the events with their table, migration, factory, API and pages.
3. Let a guest see an event, and keep the host's data to the host, with a policy.
4. Record an answer in an action, with Zod validation and typed failures.
5. Show the answer form with `useActionForm()` and the guest list in a `<DataTable>`.
6. Send the invitation mail, written in Vue and MJML.
7. Test the app in the three layers, and check the architecture rules.
8. Find the next steps.

You need Node.js 24, a running Docker, and about one hour. Run every command in the app folder.

## 1. Create the app

```bash
npm create nuxvel@latest gather
cd gather
npm install
./nv services up
./nv test
```

`create-nuxvel` writes the app into `gather/`. `./nv` runs the `nuxvel` CLI of the app. `./nv services up` starts Postgres, Redis, Mailpit and SeaweedFS in Docker, and leaves them running. `./nv test` runs the functional tests of the starter:

```
 Test Files  2 passed (2)
      Tests  5 passed (5)
```

Create the tables in the dev database, add the demo user, and start the dev server:

```bash
./nv db:migrate
./nv db:seed
npm run dev
```

`./nv db:seed` prints the demo user: `demo@example.com` with the password `demo-password`. Before the dev server starts, `npm run dev` prints a summary of the app and its services:

```
  App        https://gather.localhost
  DevTools   https://gather.localhost/__nuxt_devtools__/client/
  Storybook  https://storybook.gather.localhost
  Postgres   postgres://nuxvel:nuxvel@localhost:5432/nuxvel
  Redis      redis://localhost:6379
  Mailpit    http://localhost:8025
  Storage    http://localhost:8333 (bucket nuxvel)
  Queue      runs inside the dev server
```

| Line | What it is |
|---|---|
| App | the app, on a local HTTPS address. The first run asks for your password to trust a local certificate |
| DevTools | the Nuxt DevTools. The nuxvel tab shows the jobs, the procedures, the audit entries and a preview of each mail |
| Storybook | each component of the app alone, with no server |
| Postgres, Redis | the dev database and the Redis of the queue |
| Mailpit | every mail that the app sends in development. No mail leaves your computer |
| Storage | the S3-compatible file storage |
| Queue | the worker that sends the mail. In development, it runs inside the dev server |

Open https://gather.localhost and sign in as the demo user. Keep the dev server running. Use a second terminal for the commands of the next chapters. See [Starting a new app](../create.md) for all the files of the starter.

## 2. The first resource

A resource is one table with its API and its pages. Generate the events:

```bash
./nv make:resource event title starts_on:date place --ui
```

```
✔ Created server/database/schema/event.schema.ts
✔ Created shared/schemas/event.ts
✔ Created server/privacy/event.user-data.ts
✔ Created server/policies/event.policy.ts
✔ Created server/actions/event/create-event.action.ts
✔ Created server/actions/event/update-event.action.ts
✔ Created server/actions/event/delete-event.action.ts
✔ Created server/trpc/routers/event.router.ts
✔ Created server/trpc/routers/event.router.test.ts
✔ Created app/pages/event/index.vue
✔ Created app/pages/event/new.vue
✔ Created app/components/EventForm.vue
```

Each field after the name is `name[:type]`. The type is `string` when you do not write it. `starts_on:date` is a `date` column, a `YYYY-MM-DD` string in TypeScript. The command wrote these parts:

| File | Part |
|---|---|
| `event.schema.ts` | the Drizzle table `eventTable`. It also has `ownerId`, the user who created the row, and the `createdAt` and `updatedAt` columns |
| `shared/schemas/event.ts` | the Zod inputs `createEventInput` and `updateEventInput`, and `eventSchema`, the shape that the browser gets. The app and the server use the same schemas |
| `event.user-data.ts` | tells nuxvel that `ownerId` points at a user, so `nuxvel user:erase` finds the rows of a user |
| `event.policy.ts` | who may update and delete an event: its owner, or an admin |
| the three actions | the writes: create, update, delete |
| `event.router.ts` | the tRPC procedures `event.list`, `event.byId`, `event.create`, `event.update` and `event.delete` |
| `event.router.test.ts` | a functional test of the procedures |
| the pages | the list at `/event`, the form at `/event/new`, and the edit form in a modal |

You do not register a file. nuxvel finds the router, the policy and the actions in their folders.

A table needs a migration. Write it from the schema, and apply it:

```bash
./nv db:generate --name events
./nv db:migrate
```

`db:generate` writes `server/database/migrations/0017_events.sql`. Read the SQL before you apply it:

```sql
CREATE TABLE "event" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"title" varchar(255) NOT NULL,
	"starts_on" date NOT NULL,
	"place" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
```

The tests of chapter 7 need events. A factory inserts a row with fake data:

```bash
./nv make:factory event
```

The command writes `server/factories/event.factory.ts` and a test. It selects a [Faker](https://fakerjs.dev) value from the type and the name of each column. Change the values so that they look like real events. An event in the future is the useful default:

```ts
// server/factories/event.factory.ts
import { faker } from "@faker-js/faker";
import { userFactory } from "./users.factory";
import { defineFactory } from "@nuxvel/nuxt/factories";
import { eventTable } from "../database/schema/event.schema";

export const eventFactory = defineFactory(eventTable, {
  ownerId: async () => (await userFactory()).id,
  title: () => `${faker.word.adjective()} picnic`,
  startsOn: () => faker.date.soon({ days: 30 }).toISOString().slice(0, 10),
  place: () => faker.location.city(),
});
```

Run the tests:

```bash
./nv test
```

```
 Test Files  4 passed (4)
      Tests  11 passed (11)
```

Open https://gather.localhost/event. Select **New event**, and create an event. The list shows it. **Edit** opens the form in a modal, and **Delete** asks first. See [CLI: make:resource](../cli.md#nuxvel-makeresource-name).

## 3. Hosts and guests

The starter has sign-up and sign-in pages. The generated code already uses them:

- `definePageMeta({ middleware: "auth" })` in each page sends a signed-out visitor to `/sign-in`.
- `authedProcedure` refuses a call without a session with `UNAUTHORIZED`. In the procedure, `ctx.user` is the signed-in user, and `ctx.actor` is the same user for actions and policies.
- `event.list` and `event.byId` read only the rows where `ownerId` is `ctx.user.id`. A host sees only their own events.

A guest is a signed-in user who is not the owner. A guest must see one event, but not the list of the host and not the answers of other guests.

### The answers table

Each answer is a row of a new table, `rsvp`. It points at the event and at the guest:

```bash
./nv make:schema rsvp event:references guest:references=user answer:enum=yes,no
```

`event:references` adds the column `eventId`, with a foreign key to `eventTable`. `guest:references=user` adds `guestId`, with a foreign key to the user table. A guest has one answer for each event. In `server/database/schema/rsvp.schema.ts`, add `unique` to the import, and add a unique constraint on the two columns at the end of the table:

```ts
// server/database/schema/rsvp.schema.ts
import { index, integer, pgTable, serial, text, unique } from "drizzle-orm/pg-core";

}, (table) => [
  index("rsvp_event_id_idx").on(table.eventId),
  index("rsvp_guest_id_idx").on(table.guestId),
  unique("rsvp_event_guest_unique").on(table.eventId, table.guestId),
]);
```

`guestId` points at a user, so declare it, as the event resource did for `ownerId`:

```ts
// server/privacy/rsvp.user-data.ts
import { rsvpTable } from "../database/schema/rsvp.schema";

export const rsvpUserData = defineUserData(rsvpTable, rsvpTable.guestId);
```

Without this file, `npm run test:arch` fails. Chapter 7 runs it. See [Privacy](../privacy.md#declaring-user-data).

```bash
./nv db:generate --name rsvps
./nv db:migrate
```

### The policy

A policy says who may do what to a row. Add a rule `host` to the policy of the events:

```ts
// server/policies/event.policy.ts
import { eventTable } from "../database/schema/event.schema";

export const eventPolicy = definePolicy(eventTable, {
  update: (actor, row) => row.ownerId === (actor.userId ?? actor.id) || actor.role === "admin",
  delete: (actor, row) => row.ownerId === (actor.userId ?? actor.id) || actor.role === "admin",
  host: (actor, row) => row.ownerId === (actor.userId ?? actor.id),
});
```

A rule gets the actor and the row, and returns a boolean. `actor.userId ?? actor.id` is the user also when the call uses an API key. The `host` rule has no admin case: an admin is not the host of every event.

### The event page

Add a procedure `show` to `server/trpc/routers/event.router.ts`, after `byId`. Every signed-in user may read one event by its ID, because the invitation mail links to it:

```ts
// server/trpc/routers/event.router.ts
import { z } from "zod";

  show: authedProcedure
    .input(eventIdInput)
    .output(eventSchema.extend({ isHost: z.boolean() }))
    .query(async ({ input, ctx }) => {
      const event = await findOrFail(eventTable, input.id);

      return { ...event, isHost: await can(ctx.actor, $policies.event.host, event) };
    }),
```

- `findOrFail()` throws `NOT_FOUND` when no row has the ID.
- `can()` asks the policy and returns a boolean. `$policies.event.host` is the `host` rule. Go to definition on it opens the policy file.
- `.output()` lists the fields that the browser gets. A field that it does not list does not leave the server.

`can()`, `findOrFail()`, `$policies`, `authedProcedure` and the schemas in `shared/schemas/` are auto-imported. Import the tables and the actions yourself.

Write the page. The file name `[id].vue` gives the route `event-id`, with the param `id`:

```bash
./nv make:page "event/[id]"
```

```vue
<!-- app/pages/event/[id].vue -->
<script setup lang="ts">
definePageMeta({ middleware: "auth" });

const route = useRoute("event-id");
const trpc = useTRPC();
const event = useQuery(() => trpc.event.show.queryOptions({ id: Number(route.params.id) }));

useSeo({ title: "Event" });
</script>

<template>
  <QueryState :query="event">
    <template #default="{ data }">
      <div class="max-w-xl space-y-6">
        <div>
          <h1 class="text-2xl font-semibold">{{ data.title }}</h1>
          <p class="text-muted">{{ data.startsOn }}, {{ data.place }}</p>
        </div>
        <p v-if="data.isHost">You host this event.</p>
      </div>
    </template>
  </QueryState>
</template>
```

`useTRPC()` gives the typed procedures in the browser. `data` has the type of the `.output()` schema, so `data.isHost` is a `boolean`, and a typo does not compile. `<QueryState>` shows a loading state, an error state, or the `default` slot with the data.

Link the title of each event in the list to this page. In `app/pages/event/index.vue`, add a slot for the `title` column in the `<DataTable>`, before the `actions-cell` slot:

```vue
<!-- app/pages/event/index.vue -->
      <template #title-cell="{ row }">
        <ULink :to="{ name: 'event-id', params: { id: row.original.id } }">{{ row.original.title }}</ULink>
      </template>
```

The link uses the route name, so the typecheck fails when the page moves. Open https://gather.localhost/event and select the title of your event. The page shows "You host this event." Sign up as a second user in a private window, and open the same URL. The page shows the event without that line. See [Authorization](../authorization.md).

## 4. An action

An action is one write in one file. It validates its input, runs in a transaction and names its actor. Generate the action that records an answer:

```bash
./nv make:action rsvp/send-rsvp
```

The command writes `server/actions/rsvp/send-rsvp.action.ts` and a test. Delete the test file, `server/actions/rsvp/send-rsvp.action.test.ts`. Chapter 7 writes the tests of the app in `tests/functional/`.

### The input

The browser and the server validate the same Zod schema. Add it to `shared/schemas/rsvp.ts`, under the schemas that `make:schema` wrote:

```ts
// shared/schemas/rsvp.ts
export const sendRsvpInput = z.object({
  eventId: z.number().int().positive(),
  answer: z.enum(["yes", "no"], { error: "Pick yes or no" }),
});
```

The `error` option is the message that the form shows under the field.

### The handler

```ts
// server/actions/rsvp/send-rsvp.action.ts
import { eventTable } from "../../database/schema/event.schema";
import { rsvpTable } from "../../database/schema/rsvp.schema";

export const sendRsvpAction = defineAction({
  input: sendRsvpInput,
  errors: {
    "rsvp.host": "You host this event.",
    "rsvp.past": "This event is over.",
  },
  handler: async (input, ctx, fail) => {
    const event = await findOrFail(eventTable, input.eventId);
    const guestId = ctx.actor.userId ?? ctx.actor.id;

    if (event.ownerId === guestId) fail("rsvp.host");
    if (event.startsOn < now().toISOString().slice(0, 10)) fail("rsvp.past");

    return useDb()
      .insert(rsvpTable)
      .values({ eventId: event.id, guestId, answer: input.answer })
      .onConflictDoUpdate({ target: [rsvpTable.eventId, rsvpTable.guestId], set: { answer: input.answer } })
      .returning()
      .then(firstOrFail);
  },
});
```

- `input` validates the call first. An invalid input never reaches the handler.
- `errors` lists the expected failures, each with its message. `fail("rsvp.host")` stops the action with that failure. A code that is not in `errors` does not compile.
- A failure is not a bug. The client gets HTTP 422, the message, and the code as `error.data.actionCode`. Error tracking does not report it.
- `now()` is the current time. Tests can move it. Use it in place of `new Date()`.
- A second answer of the same guest replaces the first, because of the unique constraint.

### The procedure

A router reads, and calls an action to write. Add a router for the answers:

```ts
// server/trpc/routers/rsvp.router.ts
import { sendRsvpAction } from "../../actions/rsvp/send-rsvp.action";

export const rsvpRouter = {
  send: authedProcedure
    .input(sendRsvpInput)
    .output(rsvpSchema)
    .mutation(({ input, ctx }) => sendRsvpAction(input, { actor: ctx.actor })),
};
```

The file name gives the namespace, so the procedure is `rsvp.send`. `rsvpSchema` is the row shape that `make:schema` wrote. The next chapter adds the form that calls it. See [Actions](../actions.md#typed-failures).

## 5. A form and a list

### The answer form

`useActionForm()` connects a Nuxt UI form to a mutation. It validates in the browser with the same schema, and it shows the server's errors under the fields. Write the form as a component:

```vue
<!-- app/components/RsvpForm.vue -->
<script setup lang="ts">
const props = defineProps<{ eventId: number }>();

const trpc = useTRPC();
const form = useActionForm(sendRsvpInput, toasted(trpc.rsvp.send.mutationOptions(), "RSVP sent"), {
  defaults: { eventId: props.eventId, answer: undefined },
});
</script>

<template>
  <UForm :ref="form.ref" :schema="form.schema" :state="form.state" class="space-y-4" @submit="form.submit">
    <UFormField name="answer" label="Are you coming?">
      <URadioGroup
        v-model="form.state.answer"
        :items="[{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }]"
      />
    </UFormField>
    <UAlert v-if="form.formError" color="error" :title="form.formError" />
    <UButton type="submit" :loading="form.pending" label="Send RSVP" />
  </UForm>
</template>
```

- `answer` starts as `undefined`. A submit with no choice shows "Pick yes or no" under the field, and sends nothing.
- `toasted()` shows the toast "RSVP sent" when the mutation succeeds.
- `form.formError` holds a failure that belongs to no field, for example "This event is over." from `fail("rsvp.past")`.

### The guest list

The host sees the answers in a table. Add a procedure `guests` to the event router, after `show`. It returns one page of answers, and only to the host:

```ts
// server/trpc/routers/event.router.ts
import { userTable } from "../../database/schema/auth.schema";
import { rsvpTable } from "../../database/schema/rsvp.schema";

  guests: authedProcedure
    .input(paginationSchema.extend({ id: eventIdInput.shape.id }))
    .output(paginated(z.object({ id: z.number(), name: z.string(), answer: z.enum(["yes", "no"]) })))
    .query(async ({ input, ctx }) => {
      const event = await findOrFail(eventTable, input.id);
      await authorize(ctx.actor, $policies.event.host, event);

      return paginate(
        useDb()
          .select({ id: rsvpTable.id, name: userTable.name, answer: rsvpTable.answer })
          .from(rsvpTable)
          .innerJoin(userTable, eq(userTable.id, rsvpTable.guestId))
          .where(eq(rsvpTable.eventId, event.id))
          .orderBy(desc(rsvpTable.id))
          .$dynamic(),
        input,
      );
    }),
```

`authorize()` is the strict form of `can()`. It throws `FORBIDDEN` when the rule says no. `paginate()` runs one page of the query, and `paginated()` is the shape of that page.

`<DataTable>` shows a paginated query, with the page number in the URL:

```vue
<!-- app/components/GuestList.vue -->
<script setup lang="ts">
const props = defineProps<{ eventId: number }>();

const trpc = useTRPC();
const route = useRoute();
const guests = useQuery(() =>
  trpc.event.guests.queryOptions({ id: props.eventId, ...paginationSchema.catch({}).parse(route.query) }),
);
</script>

<template>
  <DataTable
    :query="guests"
    :columns="[{ accessorKey: 'name', header: 'Guest' }, { accessorKey: 'answer', header: 'Answer' }]"
  >
    <template #empty>
      <UEmpty title="No answers yet" />
    </template>
  </DataTable>
</template>
```

`paginationSchema.catch({})` reads `?page=` from the URL, and goes to the first page when the value is not valid.

### The page

On the event page, the host sees the list, and a guest sees the form. Replace the line "You host this event." in `app/pages/event/[id].vue`:

```vue
<!-- app/pages/event/[id].vue -->
        <section v-if="data.isHost" class="space-y-3">
          <h2 class="text-lg font-semibold">Guests</h2>
          <GuestList :event-id="data.id" />
        </section>
        <RsvpForm v-else :event-id="data.id" />
```

Nuxt finds the components in `app/components/`, so the page imports nothing. In the private window, answer **Yes** and select **Send RSVP**. Reload the host's page. The guest list shows the answer. See [Frontend: forms](../frontend.md#forms) and [Frontend: data tables](../frontend.md#data-tables).

## 6. The invitation mail

A mail is a Vue component. The server renders it to [MJML](https://mjml.io), and MJML makes HTML that email clients show correctly. Generate the mail:

```bash
./nv make:mail event.invitation
```

The command writes the mail, its template and a test. Give the mail its data:

```ts
// server/mail/event/invitation.mail.ts
import { h } from "vue";
import { z } from "zod";
import EventInvitation from "./templates/EventInvitation.vue";

export const eventInvitationMail = defineMail({
  input: z.object({ to: z.email(), title: z.string(), startsOn: z.string(), place: z.string(), url: z.url() }),
  subject: ({ title }) => `You are invited: ${title}`,
  render: (props) => h(EventInvitation, props),
  preview: () => ({
    to: "ada@example.com",
    title: "Summer picnic",
    startsOn: "2026-07-04",
    place: "Riverside Park",
    url: "https://gather.localhost/event/1",
  }),
});
```

```vue
<!-- server/mail/event/templates/EventInvitation.vue -->
<script setup lang="ts">
defineProps<{ title: string; startsOn: string; place: string; url: string }>();
</script>

<template>
  <MailLayout :preview="`You are invited: ${title}`">
    <EHeading>You are invited: {{ title }}</EHeading>
    <EText>{{ startsOn }}, {{ place }}</EText>
    <EButton :href="url" background-color="#b20d27">Answer the invitation</EButton>
  </MailLayout>
</template>
```

- The file path gives the name of the mail, `event.invitation`.
- `input` validates the data of each send. Its `to` field is the recipient.
- `<MailLayout>`, `<EHeading>`, `<EText>` and `<EButton>` are MJML components. You do not import them. Set styles with attributes, not with CSS classes.
- `preview` is the sample data of the preview in DevTools. Open the nuxvel tab of DevTools, then **Mail**, to see the mail without sending it.

The generated test of the mail checks the text of the generated template. Change it to the new template:

```ts
// server/mail/event/invitation.mail.test.ts
import { expect, renderMail } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";

describe("event.invitation mail", () => {
  it("renders the event and the link", async () => {
    const { subject, text } = await renderMail("event.invitation", {
      to: "ada@example.com",
      title: "Summer picnic",
      startsOn: "2026-07-04",
      place: "Riverside Park",
      url: "https://gather.localhost/event/1",
    });

    expect(subject).toBe("You are invited: Summer picnic");
    expect(text).toContain("2026-07-04, Riverside Park");
    expect(text).toContain("Answer the invitation https://gather.localhost/event/1");
  });
});
```

```bash
./nv test server/mail
```

```
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

`renderMail()` renders the mail in the app and sends nothing.

### The invite action

Only the host may invite. Add the input to `shared/schemas/event.ts`:

```ts
// shared/schemas/event.ts
export const inviteGuestInput = z.object({
  eventId: z.number().int().positive(),
  email: z.email({ error: "Enter an email address" }),
});
```

```bash
./nv make:action event/invite-guest
```

Delete the generated test, `server/actions/event/invite-guest.action.test.ts`, as in chapter 4. Then write the handler:

```ts
// server/actions/event/invite-guest.action.ts
import { eventTable } from "../../database/schema/event.schema";

export const inviteGuestAction = defineAction({
  input: inviteGuestInput,
  handler: async (input, ctx) => {
    const event = await findOrFail(eventTable, input.eventId);
    await authorize(ctx.actor, $policies.event.host, event);

    await sendMail("event.invitation", {
      to: input.email,
      title: event.title,
      startsOn: event.startsOn,
      place: event.place,
      url: new URL(`/event/${event.id}`, useRuntimeConfig().siteUrl).href,
    });
  },
});
```

`sendMail()` does not send the mail during the request. It queues the mail after the transaction commits, and the worker sends it. If the action fails, no mail goes out. A misspelled mail name or wrong data does not compile. `useRuntimeConfig().siteUrl` is the public address of the app. `npm run dev` sets it to the address that it prints.

Add the procedure to the event router, after `guests`:

```ts
// server/trpc/routers/event.router.ts
import { inviteGuestAction } from "../../actions/event/invite-guest.action";

  invite: authedProcedure
    .input(inviteGuestInput)
    .output(z.void())
    .mutation(({ input, ctx }) => inviteGuestAction(input, { actor: ctx.actor })),
```

### The invite form

```vue
<!-- app/components/InviteForm.vue -->
<script setup lang="ts">
const props = defineProps<{ eventId: number }>();

const trpc = useTRPC();
const form = useActionForm(inviteGuestInput, toasted(trpc.event.invite.mutationOptions(), "Invitation sent"), {
  defaults: { eventId: props.eventId, email: "" },
  onSuccess: () => {
    form.state.email = "";
  },
});
</script>

<template>
  <UForm :ref="form.ref" :schema="form.schema" :state="form.state" class="flex items-end gap-2" @submit="form.submit">
    <UFormField name="email" label="Invite a guest" class="flex-1">
      <UInput v-model="form.state.email" type="email" class="w-full" />
    </UFormField>
    <UButton type="submit" :loading="form.pending" label="Send invitation" />
  </UForm>
</template>
```

Show it to the host, under the guest list in `app/pages/event/[id].vue`:

```vue
<!-- app/pages/event/[id].vue -->
          <GuestList :event-id="data.id" />
          <InviteForm :event-id="data.id" />
```

Invite `ada@example.com` from the page of your event. Open Mailpit at http://localhost:8025. The mail "You are invited: ..." is there, and its button opens the event. See [Mail](../mail.md).

## 7. Tests

nuxvel apps have three layers of tests:

| Layer | Command | Checks |
|---|---|---|
| Functional | `./nv test` | the server: procedures, actions, rows, mail. A real Postgres, no browser |
| Component | `npm run test:ui` | one component in one state, in a browser, with a mocked server |
| End-to-end | `npm run test:e2e` | a journey across pages, with a real server and real sessions |

Each test imports `expect` from nuxvel, never from `vitest`: `@nuxvel/nuxt/testing` in a functional or end-to-end test, `@nuxvel/nuxt/storybook/test` in a story. Import `describe` and `it` from `vitest`.

### Functional tests

Each test gets a clean database. A factory inserts the rows that it needs. `actingAs(user)` calls the procedures as that user:

```ts
// tests/functional/rsvp.test.ts
import { actingAs, expect, expectRow, runAction } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { rsvpTable } from "../../server/database/schema/rsvp.schema";
import { eventFactory } from "../../server/factories/event.factory";
import { userFactory } from "../../server/factories/users.factory";

describe("RSVPs", () => {
  it("keeps the last answer of a guest", async () => {
    const event = await eventFactory();
    const { trpc } = actingAs(await userFactory({ name: "Ada" }));

    await trpc.rsvp.send({ eventId: event.id, answer: "yes" });
    await trpc.rsvp.send({ eventId: event.id, answer: "no" });

    await expectRow(rsvpTable, { eventId: event.id, answer: "no" });
  });

  it.for<{ name: string; asHost: boolean; startsOn: string; code: "rsvp.host" | "rsvp.past" }>([
    { name: "the host", asHost: true, startsOn: "2099-01-01", code: "rsvp.host" },
    { name: "a guest of a past event", asHost: false, startsOn: "2000-01-01", code: "rsvp.past" },
  ])("refuses an RSVP from $name", async ({ asHost, startsOn, code }) => {
    const host = await userFactory();
    const event = await eventFactory({ ownerId: host.id, startsOn });
    const user = asHost ? host : await userFactory();

    await expect(
      runAction("rsvp.send-rsvp", { eventId: event.id, answer: "yes" }, { actingAs: user }),
    ).rejects.toBeActionError(code);
  });

  it("shows the guest list to the host only", async () => {
    const host = await userFactory();
    const event = await eventFactory({ ownerId: host.id });
    const guest = await userFactory({ name: "Ada" });
    await actingAs(guest).trpc.rsvp.send({ eventId: event.id, answer: "yes" });

    const list = await actingAs(host).trpc.event.guests({ id: event.id });

    expect(list.rows).toEqual([{ id: expect.any(Number), name: "Ada", answer: "yes" }]);
    await expect(actingAs(guest).trpc.event.guests({ id: event.id })).rejects.toBeTrpcError("FORBIDDEN");
  });
});
```

- An argument of a factory replaces the fake value of that column: `eventFactory({ ownerId: host.id })`.
- `expectRow()` checks that the table has a row with these values.
- `it.for` runs the same test for each case of the list. The report shows one line for each case, for example "refuses an RSVP from the host". A new case is one more line.
- `runAction()` calls the action directly. `toBeActionError()` checks the code of a `fail()`.
- `toBeTrpcError("FORBIDDEN")` checks the refusal of the policy.

The invitation tests check the mail, the validation and the policy:

```ts
// tests/functional/invite.test.ts
import { actingAs, expect, expectMailSent, expectNoMailSent } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { eventFactory } from "../../server/factories/event.factory";
import { userFactory } from "../../server/factories/users.factory";

describe("invitations", () => {
  it("mails the invitation with a link to the event", async () => {
    const host = await userFactory();
    const event = await eventFactory({ ownerId: host.id, title: "Summer picnic" });

    await actingAs(host).trpc.event.invite({ eventId: event.id, email: "ada@example.com" });

    const mail = await expectMailSent("event.invitation", { to: "ada@example.com", title: "Summer picnic" });
    expect(mail.url).toMatch(new RegExp(`/event/${event.id}$`));
  });

  it("rejects an address that is not an email", async () => {
    const host = await userFactory();
    const event = await eventFactory({ ownerId: host.id });

    await expect(
      actingAs(host).trpc.event.invite({ eventId: event.id, email: "ada" }),
    ).rejects.toHaveValidationErrors({ email: "Enter an email address" });
  });

  it("lets only the host invite", async () => {
    const event = await eventFactory();

    await expect(
      actingAs(await userFactory()).trpc.event.invite({ eventId: event.id, email: "ada@example.com" }),
    ).rejects.toBeTrpcError("FORBIDDEN");
    await expectNoMailSent("event.invitation");
  });
});
```

`expectMailSent()` fails unless the mail went out with these fields. It returns the data of the mail, so the test can read the link. No mail reaches an SMTP server in a test. `toHaveValidationErrors()` checks the message under each field.

```bash
./nv test
```

```
 Test Files  7 passed (7)
      Tests  19 passed (19)
```

See [Testing: acting as a user](../testing.md#acting-as-a-user), [factories](../testing.md#factories), [expecting failures](../testing.md#expecting-failures) and [many cases in one test](../testing.md#many-cases-in-one-test).

### A component test

A story shows one component in one state. With a `play` function, the story is also a test. Generate the story of the answer form:

```bash
./nv make:story RsvpForm
```

Replace its content:

```ts
// app/components/RsvpForm.stories.ts
import type { Meta, StoryObj } from "@storybook-vue/nuxt";
import { mockTrpc, trpcSpy } from "@nuxvel/nuxt/storybook/mocks";
import { button, expect, fillForm, page, toast } from "@nuxvel/nuxt/storybook/test";
import RsvpForm from "./RsvpForm.vue";

const meta = { component: RsvpForm, args: { eventId: 1 } } satisfies Meta<typeof RsvpForm>;
export default meta;

const send = trpcSpy("rsvp.send", (input) => ({
  id: 1,
  guestId: "user-1",
  createdAt: new Date(),
  updatedAt: new Date(),
  ...input,
}));

export const SendsTheAnswer: StoryObj<typeof meta> = {
  parameters: { msw: [mockTrpc({ rsvp: { send } })] },
  play: async () => {
    await fillForm(page, { "Are you coming?": "Yes" });
    await button(page, "Send RSVP").click();

    await expect(send).toHaveBeenCalledWith({ eventId: 1, answer: "yes" });
    await expect(toast(page, "RSVP sent")).toBeVisible();
  },
};
```

- Storybook has no server. `mockTrpc` answers the tRPC calls in the browser.
- `trpcSpy("rsvp.send", ...)` answers like the function, and records each call. TypeScript checks the path, the input and the answer against the router.
- `fillForm` fills each field by its label. `button` finds a button by its text, as a screen reader does.

```bash
npm run test:ui
```

```
 Test Files  3 passed (3)
      Tests  5 passed (5)
```

The story is also in Storybook, at https://storybook.gather.localhost. See [Storybook: checking the tRPC calls](../storybook.md#checking-the-trpc-calls).

### An end-to-end test

An end-to-end test follows a user across pages in a real browser, with the real server. This journey goes from a new event to the guest list:

```ts
// tests/e2e/rsvp.test.ts
import { actingAs, button, cell, expect, expectMailSent, fillForm, heading, link, toast } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { userFactory } from "../../server/factories/users.factory";

describe("an event", () => {
  it("goes from the invitation to the guest list", async () => {
    const page = await actingAs(await userFactory()).visit("/event/new");
    await fillForm(page, { Title: "Summer picnic", "Starts on": "2099-07-04", Place: "Riverside Park" });
    await button(page, "Create event").click();
    await link(page, "Summer picnic").click();
    await expect(heading(page, "Summer picnic")).toBeVisible();

    await fillForm(page, { "Invite a guest": "ada@example.com" });
    await button(page, "Send invitation").click();
    await expect(toast(page, "Invitation sent")).toBeVisible();
    const { url } = await expectMailSent("event.invitation", { to: "ada@example.com" });

    const ada = actingAs(await userFactory({ name: "Ada", email: "ada@example.com" }));
    const guestPage = await ada.visit(url);
    await fillForm(guestPage, { "Are you coming?": "Yes" });
    await button(guestPage, "Send RSVP").click();
    await expect(toast(guestPage, "RSVP sent")).toBeVisible();

    await page.reload();
    await expect(cell(page, "Ada")).toBeVisible();
  });
});
```

- `actingAs(user).visit(path)` opens a page in a browser, signed in as that user. Each user has their own session.
- The guest opens the link of the mail, as a real guest does.
- `expect(locator)` tries again until the page shows the element, so the test does not wait a fixed time.

```bash
npm run test:e2e
```

```
 Test Files  2 passed (2)
      Tests  5 passed (5)
```

The second file is `tests/e2e/home.test.ts` of the starter. Its smoke test opens each page that has no params, `/event` and `/event/new` included, and checks it for errors and accessibility violations. See [End-to-end tests](../testing.md#end-to-end-tests).

### The architecture rules

```bash
npm run test:arch
```

```
✔ All architecture rules pass
```

`test:arch` checks the rules that keep a nuxvel app simple. For example, a router does not write to the database. Change `rsvp.send` to insert the row itself, and the command fails:

```
✖ server/trpc/routers/rsvp.router.ts: routers may not call useDb().insert/update/delete, call an action
✖ 1 architecture violation
```

A missing `server/privacy/rsvp.user-data.ts` also fails, and so does a test that imports `expect` from `vitest`. Put the router back. Then run the typecheck, which also checks the route names, the procedure paths and the mail names:

```bash
npm run typecheck
```

See [CLI: nuxvel test:arch](../cli.md#nuxvel-testarch).

## 8. Next steps

Gather now has a resource with its API and pages, auth, a policy, two actions and two forms of your own. It also has a data table, a mail and tests in the three layers.

To put the app on a server, follow [Tutorial: ship and run an app](./ship-and-run.md). It covers the Docker image, the CI workflow, a VPS with blue-green deploys, backups and monitoring.

Each of these tutorials goes deeper into one topic:

- [Tutorial: testing in depth](./testing-in-depth.md): one feature test-first, through the three layers.
- [Tutorial: build a product catalogue, component by component](./component-driven-ui.md): Storybook first, with the server mocks.
- [Tutorial: build a multi-tenant invoicing app](./invoices.md): teams, roles, two-factor sign-in, social login and API keys.
- [Tutorial: build a status page](./status-page.md): webhooks, jobs, notifications, feature flags and schedules.
- [Tutorial: build event-driven orders](./orders.md): domain events, the outbox and backfills.
- [Tutorial: build a live team chat](./realtime.md): channels, presence and live queries.
- [Tutorial: build a public recipe site](./recipe-site.md): SEO, caching, offline pages and web push.
- [Tutorial: a garden journal with its own look](./theming.md): colours, fonts, icons and dark mode.

The [documentation index](../index.md) lists every guide.
