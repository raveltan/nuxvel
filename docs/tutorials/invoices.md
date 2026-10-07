# Tutorial: a multi-tenant invoicing app

## Introduction

This tutorial builds a small SaaS app for invoices, one feature per chapter. People sign up and confirm their email address. A user creates a team and adds other users to it as an admin, a member or a viewer. The members of a team create and edit its invoices. A user never sees the team or the invoices of a team that they are not in. The tutorial also adds password reset, two-factor sign-in and sign-in with GitHub. Then it adds admin tools for the staff of the app, the audit log, rate limits and API keys for a REST API.

The tutorial is about auth and permissions. Other tutorials show the other parts of nuxvel. [The first app](./first-app.md) shows the database, the frontend, mail and tests. [The course platform](./course-platform.md) shows a larger app.

The generators write most of the code. Each chapter tells what a generator wrote, then changes it where the app needs more. Each chapter also adds tests, in the layer that owns each check:

| Layer | Command | Checks |
|---|---|---|
| Functional | `./nv test:functional` | the server: procedures, policies, rows, mails, the audit log, rate limits |
| Component | `npm run test:ui` | the states of one component, with a mocked server |
| End-to-end | `npm run test:e2e` | a journey across pages in a browser, with real auth |

See [Testing](../testing.md) for the three layers. You need Node.js 24, Docker and about 90 minutes. Run every command from the app folder.

## 1. Create the app

```bash
npm create nuxvel@latest invoices
cd invoices
npm install
```

See [Starting a new app](../create.md) for what the command writes. Start the dev services, then run the tests of the starter:

```bash
./nv services up
./nv test:functional
```

```
◇ Dev services are already healthy (docker compose)
◇ Built the app for tests: no earlier build (84.6s)

 Test Files  2 passed (2)
      Tests  5 passed (5)
```

Create the tables in the dev database, add the demo user, then start the app:

```bash
./nv db:migrate
./nv db:seed
npm run dev
```

Open the app and select **Sign up**. The starter has the auth pages already: `/sign-up`, `/sign-in`, `/forgot-password`, `/reset-password` and `/verify-email`. They use `<AuthForm>`, see [Authentication](../auth.md#the-sign-in-and-sign-up-forms).

## 2. Sign-up with email verification

In a production build, a new user must confirm their email address before they can sign in with a password. Sign-up creates the user, starts no session and sends the `nuxvel.auth.verify-email` mail. The link in the mail confirms the address and signs the user in. In `nuxt dev` and in the test build, the check is off, so that you can sign up without a mail.

To see the production behavior in development, start the dev server with the variable that turns the check on:

```bash
NUXT_AUTH_REQUIRE_EMAIL_VERIFICATION=true npm run dev
```

Sign up with a new email address. `<AuthForm>` opens `/verify-email`, which tells the user to open the link in the mail. Open Mailpit at <http://localhost:8025>. It shows the mail "Confirm your email address". Select the link in the mail. The browser opens `/`, signed in.

Do not put the variable in `.env`. The test setup loads `.env`, so the variable would also turn the check on in every test. Instead, a test file that needs the check sets the variable at its top. A variable that a test file sets on `process.env` goes to the server of that file only:

```ts
// tests/functional/sign-up.test.ts
import { describe, expect, expectMailSent, expectRow, guest, it, signIn } from "@nuxvel/nuxt/testing";
import { userTable } from "#nuxvel/schema";

process.env.NUXT_AUTH_REQUIRE_EMAIL_VERIFICATION = "true";

const ada = { name: "Ada", email: "ada@example.com", password: "correct-horse-battery" };

const post = (path: string, body: object) =>
  guest().fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("sign-up with email verification", () => {
  it("sends a verification mail and starts no session", async () => {
    const response = await post("/api/auth/sign-up/email", ada);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ token: null });
    await expectRow(userTable, { email: ada.email, emailVerified: false });
    await expectMailSent("nuxvel.auth.verify-email", { to: ada.email });
  });

  it("refuses a password sign-in before the address is confirmed", async () => {
    await post("/api/auth/sign-up/email", ada);

    const response = await post("/api/auth/sign-in/email", { email: ada.email, password: ada.password });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "EMAIL_NOT_VERIFIED" });
  });

  it("confirms the address with the link of the mail", async () => {
    await post("/api/auth/sign-up/email", ada);
    const { url } = await expectMailSent("nuxvel.auth.verify-email", { to: ada.email });
    const link = new URL(url);

    const response = await guest().fetch(link.pathname + link.search, { redirect: "manual" });

    expect(response.status).toBe(302);
    await expectRow(userTable, { email: ada.email, emailVerified: true });
    await signIn(ada.email, ada.password);
  });
});
```

These fixtures come from `@nuxvel/nuxt/testing`:

- `guest()` reaches the app with no session. Its `fetch` sends a request to the server of the test file.
- `expectMailSent(name, match)` finds the mail in the mail fake of the test build and returns its input. The verification mail has the link in `url`. No mail reaches an SMTP server.
- `expectRow(table, match)` finds a row in the test database.
- `signIn(email, password)` signs in through the real sign-in endpoint. It throws when the app refuses the password, so the last line proves that the confirmed user can sign in.

`expect` comes from `@nuxvel/nuxt/testing` too, see [Testing: expect](../testing.md#expect). Run the file:

```bash
./nv test:functional tests/functional/sign-up.test.ts
```

Chapter 14 tests the same journey in a browser. See [Authentication: email verification](../auth.md#email-verification).

## 3. Database

A team has a name. A membership puts one user in one team with one role: `admin`, `member` or `viewer`. An invoice belongs to a team. It has a customer, an amount in cents and a status.

Generate the team and the invoice with `make:resource`, and the membership table with `make:schema`. The team comes first, because the other two point at it:

```bash
./nv make:resource team name --ui --no-openapi
./nv make:schema membership team:references user:references=user role:enum=admin,member,viewer
./nv make:resource invoice customer amount:integer status:enum=draft,sent,paid:default=draft team:references --ui
```

```
✔ Created server/database/schema/team.schema.ts
✔ Created shared/schemas/team.ts
✔ Created server/policies/team.policy.ts
✔ Created server/actions/team/create-team.action.ts
✔ Created server/actions/team/update-team.action.ts
✔ Created server/actions/team/delete-team.action.ts
✔ Created server/trpc/routers/team.router.ts
✔ Created server/trpc/routers/team.router.test.ts
✔ Created app/pages/(app)/team/index.vue
✔ Created app/pages/(app)/team/new.vue
✔ Created app/components/TeamForm.vue
◇ Updated types (nuxt prepare) (7.5s)
✔ Created server/database/schema/membership.schema.ts
✔ Created shared/schemas/membership.ts
◇ Updated types (nuxt prepare) (9.5s)
✔ Created server/database/schema/invoice.schema.ts
✔ Created shared/schemas/invoice.ts
✔ Created server/policies/invoice.policy.ts
✔ Created server/actions/invoice/create-invoice.action.ts
✔ Created server/actions/invoice/update-invoice.action.ts
✔ Created server/actions/invoice/delete-invoice.action.ts
✔ Created server/trpc/routers/invoice.router.ts
✔ Created server/trpc/routers/invoice.router.test.ts
✔ Created app/pages/(app)/invoice/index.vue
✔ Created app/pages/(app)/invoice/new.vue
✔ Created app/components/InvoiceForm.vue
◇ Updated types (nuxt prepare) (9.9s)
```

While `npm run dev` runs, the last line of each command is `○ Types update in the running nuxt dev (nuxt prepare skipped)`. `make:schema` writes only the table and its Zod schemas, because the app has no page and no router of its own for memberships. `make:resource` writes the full slice: the table, the schemas, a policy, the actions, a router, a test and, with `--ui`, the pages. `--no-openapi` leaves the REST endpoints out of the team router. The invoice router keeps them, because chapter 13 gives the invoices a REST API. See [CLI: fields](../cli.md#fields) for the field syntax.

### Rows that outlive their creator

`make:resource` adds an `ownerId` column to each table, with the user who created the row. The generated column is `NOT NULL` with `onDelete: "cascade"`, so the database deletes the row with its user. That is correct for a private row. A team and its invoices belong to the team, not to one user. When the user who created the team leaves, the team must stay. Change the column in both tables, so that the database sets it to `NULL` instead:

```ts
// server/database/schema/team.schema.ts
import { index, pgTable, serial, varchar } from "drizzle-orm/pg-core";
import { belongsTo, timestamps } from "@nuxvel/nuxt/database";
import { userTable } from "./auth.schema";

export const teamTable = pgTable("team", {
  id: serial("id").primaryKey(),
  ownerId: belongsTo(userTable, { nullable: true, onDelete: "set null" }),
  name: varchar("name", { length: 255 }).notNull(),
  ...timestamps(),
}, (table) => [index("team_owner_id_idx").on(table.ownerId)]);

export type TeamRow = typeof teamTable.$inferSelect;
export type NewTeamRow = typeof teamTable.$inferInsert;
```

```ts
// server/database/schema/invoice.schema.ts
import { index, integer, pgTable, serial, text, varchar } from "drizzle-orm/pg-core";
import { belongsTo, timestamps } from "@nuxvel/nuxt/database";
import { userTable } from "./auth.schema";
import { teamTable } from "./team.schema";

export const invoiceTable = pgTable("invoice", {
  id: serial("id").primaryKey(),
  ownerId: belongsTo(userTable, { nullable: true, onDelete: "set null" }),
  customer: varchar("customer", { length: 255 }).notNull(),
  amount: integer("amount").notNull(),
  status: text("status", { enum: ["draft", "sent", "paid"] }).notNull().default("draft"),
  teamId: belongsTo(teamTable),
  ...timestamps(),
}, (table) => [index("invoice_owner_id_idx").on(table.ownerId), index("invoice_team_id_idx").on(table.teamId)]);

export type InvoiceRow = typeof invoiceTable.$inferSelect;
export type NewInvoiceRow = typeof invoiceTable.$inferInsert;
```

The column can now be empty, so change `ownerId` in `teamSchema` of `shared/schemas/team.ts` and in `invoiceSchema` of `shared/schemas/invoice.ts`:

```ts
// shared/schemas/team.ts
  ownerId: z.string().nullable(),
```

The foreign key `teamId` of the invoice keeps `onDelete: "cascade"`: a deleted team takes its invoices with it.

### One membership for each user and team

A user is in a team at most once. The generated membership table has an index for each foreign key. Replace the index on `team_id` with a unique index on `team_id` and `user_id`. A unique index that starts with `team_id` also serves the foreign key, so `db:check` still finds an index for it:

```ts
// server/database/schema/membership.schema.ts
import { index, pgTable, serial, text, uniqueIndex } from "drizzle-orm/pg-core";
import { belongsTo, timestamps } from "@nuxvel/nuxt/database";
import { teamTable } from "./team.schema";
import { userTable } from "./auth.schema";

export const membershipTable = pgTable("membership", {
  id: serial("id").primaryKey(),
  teamId: belongsTo(teamTable),
  userId: belongsTo(userTable),
  role: text("role", { enum: ["admin", "member", "viewer"] }).notNull(),
  ...timestamps(),
}, (table) => [uniqueIndex("membership_team_id_user_id_idx").on(table.teamId, table.userId), index("membership_user_id_idx").on(table.userId)]);

export type MembershipRow = typeof membershipTable.$inferSelect;
export type NewMembershipRow = typeof membershipTable.$inferInsert;
```

A membership is the user's personal data, so declare it for `nuxvel user:export` and `nuxvel user:erase`. `nuxvel test:arch` fails while a table with a `userId` column has no declaration. See [Privacy](../privacy.md):

```ts
// server/privacy/membership.user-data.ts
import { membershipTable } from "#nuxvel/schema";

export const membershipUserData = defineUserData(membershipTable);
```

Write the migration, apply it and check it:

```bash
./nv db:generate --name teams-and-invoices
./nv db:migrate
./nv db:check
```

```
[✓] Your SQL migration file ➜ server/database/migrations/0017_teams-and-invoices.sql 🚀
✔ Every foreign key has an index
✔ Every migration is in order
✔ Every migration is safe to deploy
```

### Factories

```bash
./nv make:factory team
./nv make:factory membership
./nv make:factory invoice
```

`make:factory` gives a value to each column that is `NOT NULL` and has no default. `ownerId` can now be empty, so the team and invoice factories leave it out. Give the rows names that look like real data. A membership factory makes a `member` by default, the most common role:

```ts
// server/factories/team.factory.ts
import { faker } from "@faker-js/faker";
import { defineFactory } from "@nuxvel/nuxt/factories";
import { teamTable } from "#nuxvel/schema";

export const teamFactory = defineFactory(teamTable, {
  name: () => faker.company.name(),
});
```

```ts
// server/factories/membership.factory.ts
import { defineFactory } from "@nuxvel/nuxt/factories";
import { membershipTable } from "#nuxvel/schema";

export const membershipFactory = defineFactory(membershipTable, {
  role: "member",
});
```

```ts
// server/factories/invoice.factory.ts
import { faker } from "@faker-js/faker";
import { defineFactory } from "@nuxvel/nuxt/factories";
import { invoiceTable } from "#nuxvel/schema";

export const invoiceFactory = defineFactory(invoiceTable, {
  customer: () => faker.company.name(),
  amount: () => faker.number.int({ min: 1_000, max: 500_000 }),
});
```

Most tests of this tutorial need the same rows. They need one team with an admin, a member and a viewer, an invoice of the team, and a user who is in no team. Put them in a scenario. A scenario is a plain function that builds rows with factories. See [Testing: scenarios](../testing.md#scenarios):

```ts
// tests/scenarios/team.ts
import { invoiceFactory, membershipFactory, teamFactory, userFactory } from "#nuxvel/factories";

export const everyRole = ["admin", "member", "viewer"] as const;

export async function team() {
  const row = await teamFactory();
  const members = {
    admin: await userFactory(),
    member: await userFactory(),
    viewer: await userFactory(),
  };

  for (const role of everyRole) {
    await membershipFactory({ teamId: row.id, userId: members[role].id, role });
  }

  return {
    team: row,
    invoice: await invoiceFactory({ teamId: row.id, ownerId: members.member.id }),
    ...members,
    outsider: await userFactory(),
  };
}
```

### Seeding two teams

The demo user is the admin of Acme. Grace is a viewer of Acme and the admin of Globex. The demo user must not see the invoices of Globex:

```ts
// server/seeders/database.seeder.ts
import { invoiceFactory, membershipFactory, teamFactory, userFactory } from "#nuxvel/factories";

const DEMO_EMAIL = "demo@example.com";
const DEMO_PASSWORD = "demo-password";

export const databaseSeeder = defineSeeder(async () => {
  const demo = await userFactory.withPassword(DEMO_PASSWORD)({ name: "Demo User", email: DEMO_EMAIL, emailVerified: true });
  const grace = await userFactory({ name: "Grace Hopper", emailVerified: true });

  const acme = await teamFactory({ name: "Acme", owner: demo });
  await membershipFactory({ teamId: acme.id, userId: demo.id, role: "admin" });
  await membershipFactory({ teamId: acme.id, userId: grace.id, role: "viewer" });
  await invoiceFactory.for("teamId", acme).for("ownerId", demo).count(5)();

  const globex = await teamFactory({ name: "Globex", owner: grace });
  await membershipFactory({ teamId: globex.id, userId: grace.id, role: "admin" });
  await invoiceFactory.for("teamId", globex).for("ownerId", grace).count(3)();

  return [`Sign in as ${DEMO_EMAIL} with the password ${DEMO_PASSWORD}`];
});
```

```bash
./nv db:fresh --seed --force
```

```
Sign in as demo@example.com with the password demo-password
✔ Seeded database
```

Replace the starter's seeder test, so that it checks the teams too:

```ts
// tests/functional/seeders.test.ts
import { describe, expect, expectCount, expectRow, it, runSeeder, signIn } from "@nuxvel/nuxt/testing";
import { userTable, invoiceTable, teamTable } from "#nuxvel/schema";

describe("the database seeder", () => {
  it("creates a demo admin of Acme, who sees only the invoices of Acme", async () => {
    await runSeeder("database");

    await expectRow(userTable, { email: "demo@example.com", name: "Demo User" });
    const acme = await expectRow(teamTable, { name: "Acme" });
    await expectCount(invoiceTable, 8);

    const { api } = await signIn("demo@example.com", "demo-password");
    const page = await api.invoice.list();

    expect(page.total).toBe(5);
    expect(page.rows.every((row) => row.teamId === acme.id)).toBe(true);
  });
});
```

See [Database](../database.md) and [Testing: factories](../testing.md#factories).

## 4. Roles and policies

The roles of a team decide who may do what:

| Action | admin | member | viewer |
|---|---|---|---|
| Read the team, its members and its invoices | yes | yes | yes |
| Create and update an invoice | yes | yes | no |
| Delete an invoice | yes | no | no |
| Rename the team, add members, change roles | yes | no | no |
| Delete the team | yes | no | no |

The user table also has a `role` column. Its value is `user` for every new user. In this app, the value `admin` is for the staff of the app, not for a team. Chapter 9 uses it. Keep the two kinds of role apart: a team role is a row in `membership`, and the app role is a column of `user`.

### The policies

A policy decides about one row. The generated team policy lets the owner of the row, or a user with the app role `admin`, update and delete it. That rule does not fit a team. The staff must not change the teams of the customers. And every admin of the team manages it, not only its creator. Each rule needs the role of the actor in the team of the row, so add three helpers. A file in `server/utils/` is auto-imported on the server:

```ts
// server/utils/teams.ts
import { and, eq, inArray } from "drizzle-orm";
import { invoiceTable, type MembershipRow, membershipTable, teamTable } from "#nuxvel/schema";

export type TeamRole = MembershipRow["role"];

export const teamIdsOf = (userId: string) =>
  useDb().select({ id: membershipTable.teamId }).from(membershipTable).where(eq(membershipTable.userId, userId));

export async function teamRoles(userId: string, teamIds: number[]) {
  const rows = await useDb()
    .select({ teamId: membershipTable.teamId, role: membershipTable.role })
    .from(membershipTable)
    .where(and(eq(membershipTable.userId, userId), inArray(membershipTable.teamId, teamIds)));

  return new Map<number, TeamRole>(rows.map((row) => [row.teamId, row.role]));
}

export const findTeamFor = (userId: string, id: number) =>
  useDb()
    .select()
    .from(teamTable)
    .where(and(eq(teamTable.id, id), inArray(teamTable.id, teamIdsOf(userId))))
    .then(firstOrFail);

export const findInvoiceFor = (userId: string, id: number) =>
  useDb()
    .select()
    .from(invoiceTable)
    .where(and(eq(invoiceTable.id, id), inArray(invoiceTable.teamId, teamIdsOf(userId))))
    .then(firstOrFail);
```

- `teamIdsOf(userId)` is a subquery of the teams of a user.
- `teamRoles(userId, teamIds)` loads the roles of a user in several teams with one query.
- `findTeamFor()` and `findInvoiceFor()` load a row only from the teams of the user. Chapter 5 uses them.

Replace the two generated policies:

```ts
// server/policies/team.policy.ts
import { teamTable } from "#nuxvel/schema";

export const teamPolicy = definePolicy(teamTable, {
  preload: async (actor, rows) => ({ roles: actor.userId ? await teamRoles(actor.userId, rows.map((row) => row.id)) : new Map<number, TeamRole>() }),
  rules: {
    createInvoice: (actor, row, { roles }) => ["admin", "member"].includes(roles.get(row.id) ?? ""),
    manage: (actor, row, { roles }) => roles.get(row.id) === "admin",
    delete: (actor, row, { roles }) => roles.get(row.id) === "admin",
  },
});
```

```ts
// server/policies/invoice.policy.ts
import { invoiceTable } from "#nuxvel/schema";

export const invoicePolicy = definePolicy(invoiceTable, {
  preload: async (actor, rows) => ({ roles: actor.userId ? await teamRoles(actor.userId, rows.map((row) => row.teamId)) : new Map<number, TeamRole>() }),
  rules: {
    update: (actor, row, { roles }) => ["admin", "member"].includes(roles.get(row.teamId) ?? ""),
    delete: (actor, row, { roles }) => roles.get(row.teamId) === "admin",
  },
});
```

`preload` loads the data that the rules need, here the roles of the actor. It gets every row that the policy checks, so `canMany()` checks a list of rows with one query. Its result is the third argument of each rule. See [Authorization: preloading data for rules](../authorization.md#preloading-data-for-rules).

An invoice that does not exist yet has no row to check. So the rule for a new invoice is on the team: `createInvoice` checks the team that the invoice goes into. A user who is not in the team has no role, so every rule refuses them. A rule that the policy does not have, such as `update` on a team, refuses every actor.

### The actions

The team actions load the team only from the teams of the user, then enforce the rule. The create action also makes its user the first admin of the team:

```ts
// server/actions/team/create-team.action.ts
import { membershipTable, teamTable } from "#nuxvel/schema";

export const createTeamAction = defineAction({
  input: createTeamInput,
  handler: async (input, ctx) => {
    if (!ctx.actor.userId) throw new ForbiddenError("This action needs a user");

    const userId = ctx.actor.userId;
    const row = await insertOne(teamTable, { ...input, ownerId: userId });

    await useDb().insert(membershipTable).values({ teamId: row.id, userId, role: "admin" });
    await audit("team.created", row);

    return row;
  },
});
```

The action runs in one transaction, so the team and its first membership commit together. In the generated update and delete actions, replace the two lines that load and authorize the row. The update action enforces `manage`, and the delete action keeps `delete`:

```ts
// server/actions/team/update-team.action.ts
    if (!ctx.actor.userId) throw new ForbiddenError("This action needs a user");
    const row = await findTeamFor(ctx.actor.userId, id);
    await authorize("manage", teamTable, row);
```

```ts
// server/actions/team/delete-team.action.ts
    if (!ctx.actor.userId) throw new ForbiddenError("This action needs a user");
    const row = await findTeamFor(ctx.actor.userId, input.id);
    await authorize("delete", teamTable, row);
```

An admin adds a user who already signed up, by email, and changes the role of a member. Generate the two actions:

```bash
./nv make:action team/add-member team_id:integer email:email role:enum=admin,member,viewer
./nv make:action team/change-role membership_id:integer role:enum=admin,member,viewer
```

The form in the browser must check the same input, so move the two input schemas from the actions to `shared/schemas/membership.ts`. Add a schema for one member with the name and the email of the user, for the member list:

```ts
// shared/schemas/membership.ts
export const addMemberInput = z.object({
  teamId: z.number().int().positive(),
  email: z.email().max(255),
  role: z.enum(["admin", "member", "viewer"]),
});

export const changeRoleInput = z.object({
  membershipId: z.number().int().positive(),
  role: z.enum(["admin", "member", "viewer"]),
});

export const memberSchema = membershipSchema.extend({ name: z.string(), email: z.string() });
```

Then write the handlers:

```ts
// server/actions/team/add-member.action.ts
import { eq } from "drizzle-orm";
import { userTable, membershipTable, teamTable } from "#nuxvel/schema";

export const addMemberAction = defineAction({
  input: addMemberInput,
  errors: {
    "team.unknown-email": { message: "Nobody with this email has signed up", field: "email" },
  },
  handler: async (input, ctx, fail) => {
    if (!ctx.actor.userId) throw new ForbiddenError("This action needs a user");

    const team = await findTeamFor(ctx.actor.userId, input.teamId);
    await authorize("manage", teamTable, team);

    const [user] = await useDb().select().from(userTable).where(eq(userTable.email, input.email));
    if (!user) return fail("team.unknown-email");

    const row = await insertOne(membershipTable, { teamId: team.id, userId: user.id, role: input.role });

    await audit("membership.added", row, { metadata: { teamId: team.id, role: row.role } });

    return { ...row, name: user.name, email: user.email };
  },
});
```

```ts
// server/actions/team/change-role.action.ts
import { and, eq } from "drizzle-orm";
import { membershipTable, teamTable } from "#nuxvel/schema";

export const changeRoleAction = defineAction({
  input: changeRoleInput,
  errors: {
    "team.last-admin": "A team needs at least one admin",
  },
  handler: async (input, ctx, fail) => {
    if (!ctx.actor.userId) throw new ForbiddenError("This action needs a user");

    const membership = await findOrFail(membershipTable, input.membershipId);
    const team = await findTeamFor(ctx.actor.userId, membership.teamId);
    await authorize("manage", teamTable, team);

    if (membership.role === "admin" && input.role !== "admin") {
      const admins = await useDb()
        .select({ id: membershipTable.id })
        .from(membershipTable)
        .where(and(eq(membershipTable.teamId, team.id), eq(membershipTable.role, "admin")));
      if (admins.length === 1) return fail("team.last-admin");
    }

    const row = await updateOne(membershipTable, membership.id, { role: input.role });

    await audit("membership.role-changed", row, { changes: { role: { from: membership.role, to: row.role } } });

    return row;
  },
});
```

`errors` declares the typed failures of an action. `fail()` accepts only a declared code. A team without an admin could never get one again, so `change-role` refuses to demote the last admin. The unique index refuses a second membership of the same user, and the procedure answers it with `CONFLICT`. Chapter 11 reads the `audit()` calls.

The invoice actions follow the same steps. The create action loads the team of the input from the teams of the user and checks `createInvoice`. The owner of the new invoice is `ctx.actor.userId`. In an action, `userId` is `undefined` for a system actor, so the first line refuses an actor without a user, as the generated create action does:

```ts
// server/actions/invoice/create-invoice.action.ts
import { invoiceTable, teamTable } from "#nuxvel/schema";

export const createInvoiceAction = defineAction({
  input: createInvoiceInput,
  handler: async (input, ctx) => {
    if (!ctx.actor.userId) throw new ForbiddenError("This action needs a user");

    const userId = ctx.actor.userId;
    const team = await findTeamFor(userId, input.teamId);
    await authorize("createInvoice", teamTable, team);

    const row = await insertOne(invoiceTable, { ...input, ownerId: userId });

    await audit("invoice.created", row);

    return row;
  },
});
```

An invoice stays in its team, so remove `teamId` from the update input:

```ts
// shared/schemas/invoice.ts
export const updateInvoiceInput = createInvoiceInput.omit({ teamId: true }).partial().extend({
  id: invoiceIdInput.shape.id,
});
```

The update action no longer needs the check of a new team:

```ts
// server/actions/invoice/update-invoice.action.ts
import { invoiceTable } from "#nuxvel/schema";

export const updateInvoiceAction = defineAction({
  input: updateInvoiceInput,
  handler: async ({ id, ...fields }, ctx) => {
    if (!ctx.actor.userId) throw new ForbiddenError("This action needs a user");

    const row = await findInvoiceFor(ctx.actor.userId, id);
    await authorize("update", invoiceTable, row);

    if (Object.keys(fields).length === 0) return row;

    return updateOne(invoiceTable, id, fields);
  },
});
```

In the delete action, replace the first line of the handler with these two lines:

```ts
// server/actions/invoice/delete-invoice.action.ts
    if (!ctx.actor.userId) throw new ForbiddenError("This action needs a user");
    const row = await findInvoiceFor(ctx.actor.userId, input.id);
```

The generated edit form of an invoice has a team field. Remove the `teamId` field, its default and the team query from `app/components/InvoiceForm.vue`.

### Test the actions

Replace the generated test of each new action:

```ts
// server/actions/team/add-member.action.test.ts
import { actingAs, describe, expect, it, runAction } from "@nuxvel/nuxt/testing";
import { team } from "../../../tests/scenarios/team";

describe("team/add-member action", () => {
  it("adds a signed-up user with a role", async () => {
    const t = await team();

    const added = await runAction("team.add-member", { teamId: t.team.id, email: t.outsider.email, role: "viewer" }, { actingAs: t.admin });

    expect(added).toMatchObject({ userId: t.outsider.id, role: "viewer", email: t.outsider.email });
  });

  it("fails with a typed code for an email that nobody signed up with", async () => {
    const t = await team();

    await expect(
      runAction("team.add-member", { teamId: t.team.id, email: "nobody@example.com", role: "viewer" }, { actingAs: t.admin }),
    ).rejects.toBeActionError("team.unknown-email");
  });

  it("refuses a user who is already a member", async () => {
    const t = await team();

    await expect(
      actingAs(t.admin).api.team.addMember({ teamId: t.team.id, email: t.viewer.email, role: "member" }),
    ).rejects.toBeTrpcError("CONFLICT");
  });
});
```

```ts
// server/actions/team/change-role.action.test.ts
import { describe, expect, expectRow, it, runAction } from "@nuxvel/nuxt/testing";
import { team } from "../../../tests/scenarios/team";
import { membershipTable } from "#nuxvel/schema";

describe("team/change-role action", () => {
  it("changes the role of a member", async () => {
    const t = await team();
    const viewer = await expectRow(membershipTable, { teamId: t.team.id, userId: t.viewer.id });

    await runAction("team.change-role", { membershipId: viewer.id, role: "member" }, { actingAs: t.admin });

    await expectRow(membershipTable, { id: viewer.id, role: "member" });
  });

  it("keeps the last admin of a team", async () => {
    const t = await team();
    const admin = await expectRow(membershipTable, { teamId: t.team.id, userId: t.admin.id });

    await expect(
      runAction("team.change-role", { membershipId: admin.id, role: "viewer" }, { actingAs: t.admin }),
    ).rejects.toBeActionError("team.last-admin");
  });
});
```

`runAction()` runs an action in the server of the test file, as the user of `actingAs`. It has the same validation and transaction as a real call. `toBeActionError(code)` matches a declared failure. The third test goes through the router of chapter 5, because the router turns the unique violation into `CONFLICT`. The last test of the chapter checks that a new team has its creator as admin. It reads the members and the `can` of the team through the router, so it passes after chapter 5:

```ts
// server/actions/team/create-team.action.test.ts
import { actingAs, describe, expect, it } from "@nuxvel/nuxt/testing";
import { userFactory } from "#nuxvel/factories";

describe("team/create-team action", () => {
  it("makes the user who creates a team its admin", async () => {
    const ada = await userFactory();
    const { api } = actingAs(ada);

    const created = await api.team.create({ name: "Acme" });

    expect(await api.team.members({ id: created.id })).toEqual([
      expect.objectContaining({ userId: ada.id, role: "admin", email: ada.email }),
    ]);
    expect((await api.team.byId({ id: created.id })).can).toEqual({ manage: true, createInvoice: true });
  });
});
```

See [Authorization](../authorization.md) and [Actions](../actions.md).

## 5. Tenant isolation

A policy checks one row that the code already loaded. It does not hide rows from a list. The generated routers read the rows of `ownerId = ctx.user.id`, so a member sees only the invoices that they created. A team app reads the rows of the teams of the user instead.

Each read and each write in this app starts from the teams of the user:

- A list adds `inArray(teamId, teamIdsOf(userId))` to its query.
- A read or a write of one row loads it with `findTeamFor()` or `findInvoiceFor()`. A row of another team gives `NOT_FOUND`, the same as a row that does not exist. So a user cannot find out that a row of another team exists.
- After the load, `authorize()` checks the role. A viewer of the same team gets `FORBIDDEN`.

The database filters the rows, so a mistake in a page cannot show the rows of another team. See [Authorization: scoping reads](../authorization.md#scoping-reads).

### The team router

Replace the generated team router. `list` and `byId` read only the teams of the user. `members` returns the members of one team with their names, and `byId` sends `can`, what the user may do, with `withAbilities()`. `delete` uses `freshProcedure`, and `addMember` has a rate limit: chapters 9 and 12 tell why.

```ts
// server/trpc/routers/team.router.ts
import { and, asc, desc, eq, getTableColumns, inArray } from "drizzle-orm";
import { z } from "zod";
import { createTeamAction } from "#server/actions/team/create-team.action";
import { updateTeamAction } from "#server/actions/team/update-team.action";
import { deleteTeamAction } from "#server/actions/team/delete-team.action";
import { userTable, membershipTable, teamTable } from "#nuxvel/schema";

export const teamRouter = {
  list: authedProcedure
    .input(teamListInput)
    .output(paginated(teamSchema))
    .query(({ input, ctx }) =>
      paginate(
        useDb()
          .select()
          .from(teamTable)
          .where(and(inArray(teamTable.id, teamIdsOf(ctx.user.id)), listWhere(teamTable, input.filters)))
          .orderBy(...listOrderBy(teamTable, input.sort), desc(teamTable.id))
          .$dynamic(),
        input,
      ),
    ),
  byId: authedProcedure
    .input(teamIdInput)
    .output(withAbilities(teamSchema, [$policies.team.manage, $policies.team.createInvoice]))
    .query(({ input, ctx }) => findTeamFor(ctx.user.id, input.id)),
  members: authedProcedure
    .input(teamIdInput)
    .output(z.array(memberSchema))
    .query(async ({ input, ctx }) => {
      const team = await findTeamFor(ctx.user.id, input.id);

      return useDb()
        .select({ ...getTableColumns(membershipTable), name: userTable.name, email: userTable.email })
        .from(membershipTable)
        .innerJoin(userTable, eq(userTable.id, membershipTable.userId))
        .where(eq(membershipTable.teamId, team.id))
        .orderBy(asc(membershipTable.id));
    }),
  create: authedProcedure
    .input(createTeamInput)
    .output(teamSchema)
    .mutation(async ({ input }) => {
      const row = await createTeamAction(input);
      flash("Team created");
      return row;
    }),
  update: authedProcedure
    .input(updateTeamInput)
    .output(teamSchema)
    .mutation(async ({ input }) => {
      const row = await updateTeamAction(input);
      flash("Team saved");
      return row;
    }),
  delete: freshProcedure
    .input(teamIdInput)
    .output(teamIdInput)
    .mutation(async ({ input }) => {
      const row = await deleteTeamAction(input);
      flash("Team deleted");
      return row;
    }),
  addMember: authedProcedure
    .use(rateLimit({ points: 10, window: { hours: 1 }, by: "user" }))
    .output(memberSchema)
    .action($actions.team.addMember),
  changeRole: authedProcedure
    .output(membershipSchema)
    .action($actions.team.changeRole),
};
```

In a procedure, `ctx.user` is the signed-in user, or the owner of the API key. So the reads use `ctx.user.id`, and the actions use `ctx.actor.userId`. `withAbilities()` answers several rules of the policy with one `preload`. See [Authorization: showing what a user may do](../authorization.md#showing-what-a-user-may-do).

### The invoice router

In the generated invoice router, change the `where` of `list` and the query of `byId`. The summaries of the REST endpoints show in the OpenAPI document of chapter 13, so give them correct English too:

```ts
// server/trpc/routers/invoice.router.ts
  list: authedProcedure
    .openapi({ path: "/invoice", summary: "List the invoices of your teams", tags: ["invoice"] })
    .input(invoiceListInput)
    .output(paginated(invoiceSchema))
    .query(({ input, ctx }) =>
      paginate(
        useDb()
          .select()
          .from(invoiceTable)
          .where(and(inArray(invoiceTable.teamId, teamIdsOf(ctx.user.id)), listWhere(invoiceTable, input.filters)))
          .orderBy(...listOrderBy(invoiceTable, input.sort), desc(invoiceTable.id))
          .$dynamic(),
        input,
      ),
    ),
  byId: authedProcedure
    .openapi({ path: "/invoice/{id}", summary: "Get an invoice", tags: ["invoice"] })
    .input(invoiceIdInput)
    .output(invoiceSchema)
    .query(({ input, ctx }) => findInvoiceFor(ctx.user.id, input.id)),
```

Change the import from `drizzle-orm` to `import { and, desc, inArray } from "drizzle-orm";`, and the summaries of the other procedures to "Create an invoice", "Update an invoice" and "Delete an invoice".

### An authorization table

The rules of chapter 4 are a table of roles and procedures. Test them as a table. Each case names a procedure, the team roles that may call it, and the call. `describe.for` runs the inner tests once for each procedure, and `it.for` runs the first test once for each role:

```ts
// tests/functional/authorization.test.ts
import { actingAs, describe, expect, expectRefused, guest, it, type TestCaller } from "@nuxvel/nuxt/testing";
import { everyRole, team } from "../scenarios/team";

type Team = Awaited<ReturnType<typeof team>>;
type Role = (typeof everyRole)[number];

const procedures: { name: string; allowed: Role[]; call: (api: TestCaller, t: Team) => Promise<unknown> }[] = [
  { name: "read the team", allowed: ["admin", "member", "viewer"], call: (api, t) => api.team.members({ id: t.team.id }) },
  { name: "read an invoice", allowed: ["admin", "member", "viewer"], call: (api, t) => api.invoice.byId({ id: t.invoice.id }) },
  {
    name: "create an invoice",
    allowed: ["admin", "member"],
    call: (api, t) => api.invoice.create({ teamId: t.team.id, customer: "Initech", amount: 120_000 }),
  },
  { name: "update an invoice", allowed: ["admin", "member"], call: (api, t) => api.invoice.update({ id: t.invoice.id, status: "sent" }) },
  { name: "delete an invoice", allowed: ["admin"], call: (api, t) => api.invoice.delete({ id: t.invoice.id }) },
  { name: "rename the team", allowed: ["admin"], call: (api, t) => api.team.update({ id: t.team.id, name: "Renamed" }) },
  {
    name: "add a member",
    allowed: ["admin"],
    call: (api, t) => api.team.addMember({ teamId: t.team.id, email: t.outsider.email, role: "viewer" }),
  },
  { name: "delete the team", allowed: ["admin"], call: (api, t) => api.team.delete({ id: t.team.id }) },
];

describe.for(procedures)("$name", ({ allowed, call }) => {
  it.for(everyRole)("as a team %s", async (role) => {
    const t = await team();
    const result = call(actingAs(t[role]).api, t);

    if (allowed.includes(role)) await expect(result).resolves.toBeDefined();
    else await expect(result).rejects.toBeTrpcError("FORBIDDEN");
  });

  it("as a user of another team", async () => {
    const t = await team();

    await expect(call(actingAs(t.outsider).api, t)).rejects.toBeTrpcError("NOT_FOUND");
  });
});

describe("tenant isolation", () => {
  it("lists only the teams and invoices of the user's teams", async () => {
    const ours = await team();
    const theirs = await team();

    const { api } = actingAs(ours.viewer);

    expect((await api.team.list()).rows.map((row) => row.id)).toEqual([ours.team.id]);
    expect((await api.invoice.list()).rows.map((row) => row.id)).toEqual([ours.invoice.id]);
    expect((await actingAs(theirs.viewer).api.invoice.list()).rows.map((row) => row.id)).toEqual([theirs.invoice.id]);
  });

  it("refuses a guest on every procedure", async () => {
    await expectRefused(guest().api.team, "UNAUTHORIZED");
    await expectRefused(guest().api.invoice, "UNAUTHORIZED");
  });
});
```

The table gives 32 tests from 8 cases, and a new procedure is one more line:

- `actingAs(user).api` calls a procedure as that user, with the same `ctx.user` and `ctx.actor` as a real request. See [Testing: acting as a user](../testing.md#acting-as-a-user).
- `TestCaller` is the type of `actingAs(user).api`, so each `call` is typed by the router.
- The case list holds functions, never rows. The setup empties the tables after each test, so each test makes its own team. See [Testing: values in the case list](../testing.md#values-in-the-case-list-are-data-or-functions-never-rows).
- `expectRefused(router, code)` calls every procedure of a router and checks the code of each refusal. It reads the procedures from the app router, so it also checks a procedure that you add later. See [Testing: refusing a whole router](../testing.md#refusing-a-whole-router).

The generated router tests check the old owner rule, so delete `server/trpc/routers/team.router.test.ts` and `server/trpc/routers/invoice.router.test.ts`. The table replaces them. Run the functional tests:

```bash
./nv test:functional
```

See [Testing: many cases in one test](../testing.md#many-cases-in-one-test).

## 6. The team page

`--ui` wrote the team and invoice lists and their forms. The app needs a page for one team, with its members. In `app/pages/(app)/team/index.vue`, add a slot for the `name` column before the `#actions-cell` slot, so that each name links to the team page:

```vue
<!-- app/pages/(app)/team/index.vue -->
      <template #name-cell="{ row }">
        <ULink :to="{ name: 'team-id', params: { id: row.original.id } }" class="font-medium">{{ row.original.name }}</ULink>
      </template>
```

No generator writes a page that shows two tables, so create the page by hand:

```vue
<!-- app/pages/(app)/team/[id].vue -->
<script setup lang="ts">
const id = Number(useRoute().params.id);
const team = $api.team.byId.useQuery({ id });

useSeo(() => ({ title: team.data?.name ?? "Team" }));
</script>

<template>
  <div class="max-w-2xl space-y-6">
    <QueryState :query="team">
      <template #default="{ data }">
        <h1 class="text-2xl font-semibold">{{ data.name }}</h1>
        <MemberList :team-id="data.id" />
      </template>
    </QueryState>
  </div>
</template>
```

When `team.byId` answers `NOT_FOUND` while the server renders the page, nuxvel answers the page with HTTP 404. So a team of another user opens the 404 page. The member list shows the members to every member of the team. An admin gets a role select for each member and a form that adds a member:

```vue
<!-- app/components/MemberList.vue -->
<script setup lang="ts">
const props = defineProps<{ teamId: number }>();

const members = $api.team.members.useQuery({ id: props.teamId });
const team = $api.team.byId.useQuery({ id: props.teamId });
const roles = addMemberInput.shape.role.options;

const { mutate: changeRole, error: roleError } = $api.team.changeRole.useMutation();

const form = useActionForm($api.team.addMember, {
  toast: "Member added",
  defaults: { teamId: props.teamId, email: "", role: "member" },
});
</script>

<template>
  <section class="space-y-4">
    <h2 class="text-lg font-semibold">Members</h2>
    <UAlert v-if="roleError" role="alert" color="error" variant="subtle" :title="roleError.message" />
    <QueryState :query="members">
      <template #default="{ data }">
        <ul class="divide-y divide-default">
          <li v-for="member in data" :key="member.id" class="flex items-center justify-between gap-4 py-2">
            <span>{{ member.name }} <span class="text-muted">{{ member.email }}</span></span>
            <USelect
              v-if="team.data?.can.manage"
              :model-value="member.role"
              :items="roles"
              :aria-label="`Role of ${member.email}`"
              class="w-32"
              @update:model-value="changeRole({ membershipId: member.id, role: $event })"
            />
            <UBadge v-else color="neutral" variant="subtle" :label="member.role" />
          </li>
        </ul>
      </template>
    </QueryState>
    <UForm
      v-if="team.data?.can.manage"
      :ref="form.ref"
      :schema="form.schema"
      :state="form.state"
      class="flex items-start gap-2"
      @submit="form.submit"
    >
      <UFormField name="email" label="Email" class="w-64">
        <UInput v-model="form.state.email" type="email" class="w-full" />
      </UFormField>
      <UFormField name="role" label="Role" class="w-32">
        <USelect v-model="form.state.role" :items="roles" class="w-full" />
      </UFormField>
      <UButton type="submit" class="mt-6" :loading="form.pending" label="Add member" />
    </UForm>
    <UAlert v-if="form.formError" role="alert" color="error" variant="subtle" :title="form.formError" />
  </section>
</template>
```

- `addMemberInput.shape.role.options` is the list of roles from the shared schema, so the page and the server cannot disagree.
- `useActionForm($api.team.addMember)` checks the input in the browser with `addMemberInput`, then calls the mutation. The `field` of the typed failure `team.unknown-email` shows it under the email field. Any other refusal, such as `CONFLICT` or a rate limit, shows in `form.formError`.
- The page hides the forms from a member and a viewer. The hidden form is only for the user: the actions still call `authorize()`.

The starter's header has no links to these pages. In `app/layouts/default.vue`, add two links after `<AppLogo />`, and the user menu after `<NotificationBell />`:

```vue
<!-- app/layouts/default.vue -->
          <AppLogo />
          <UButton :to="{ name: 'team' }" color="neutral" variant="ghost" label="Teams" />
          <UButton :to="{ name: 'invoice' }" color="neutral" variant="ghost" label="Invoices" />
        </nav>
        <div class="flex items-center gap-2">
          <PwaInstallPrompt />
          <NotificationBell />
          <UserMenu />
        </div>
```

Sign in as `demo@example.com`. Open **Teams**. The list shows Acme and not Globex. Open Acme. Change the role of Grace Hopper to `member`. Change your own role to `viewer`. The alert "A team needs at least one admin" shows. Enter `nobody@example.com` under **Email** and select **Add member**. The message "Nobody with this email has signed up" shows under the field. Open **Invoices**. The list shows the five invoices of Acme.

### Component tests

A story is one state of one component, and its `play` function checks that state. `npm run test:ui` runs each story in a browser, without a server. `mockTrpc` answers the tRPC calls of the component, and `trpcSpy` records the calls. Each error class of `@nuxvel/nuxt/storybook/mocks` sends an error in the shape of the real server. Write a story for each state of the member list:

```ts
// app/components/MemberList.stories.ts
import type { Meta, StoryObj } from "@storybook-vue/nuxt";
import { ActionError, mockTrpc, RateLimitedError, trpcSpy } from "@nuxvel/nuxt/storybook/mocks";
import { alert, button, expect, fillForm, page, text } from "@nuxvel/nuxt/storybook/test";
import MemberList from "./MemberList.vue";

const createdAt = new Date("2026-09-01T09:00:00Z");
const members = [
  { id: 1, teamId: 1, userId: "user-1", role: "admin" as const, name: "Ada Lovelace", email: "ada@example.com", createdAt, updatedAt: createdAt },
  { id: 2, teamId: 1, userId: "user-2", role: "viewer" as const, name: "Grace Hopper", email: "grace@example.com", createdAt, updatedAt: createdAt },
];

const team = { id: 1, name: "Acme", ownerId: "user-1", createdAt, updatedAt: createdAt };
const asAdmin = () => ({ ...team, can: { manage: true, createInvoice: true } });
const asViewer = () => ({ ...team, can: { manage: false, createInvoice: false } });
const changeRole = trpcSpy("team.changeRole", (input) => ({ ...members[1]!, role: input.role }));
const addMember = trpcSpy("team.addMember", (input) => ({ ...members[1]!, id: 3, role: input.role, email: input.email }));

const meta = { component: MemberList, args: { teamId: 1 } } satisfies Meta<typeof MemberList>;
export default meta;

export const AdminChangesARole: StoryObj<typeof meta> = {
  parameters: { msw: [mockTrpc({ team: { members: () => members, byId: asAdmin, changeRole } })] },
  play: async () => {
    await fillForm(page, { "Role of grace@example.com": "member" });

    await expect(changeRole).toHaveBeenCalledWith({ membershipId: 2, role: "member" });
  },
};

export const AdminAddsAMember: StoryObj<typeof meta> = {
  parameters: { msw: [mockTrpc({ team: { members: () => members, byId: asAdmin, addMember } })] },
  play: async () => {
    await fillForm(page, { Email: "linus@example.com", Role: "viewer" });
    await button(page, "Add member").click();

    await expect(addMember).toHaveBeenCalledWith({ teamId: 1, email: "linus@example.com", role: "viewer" });
  },
};

export const ViewerSeesTheRoles: StoryObj<typeof meta> = {
  parameters: { msw: [mockTrpc({ team: { members: () => members, byId: asViewer } })] },
  play: async () => {
    await expect(text(page, "viewer")).toBeVisible();
    await expect(button(page, "Add member")).toBeHidden();
  },
};

export const KeepsTheLastAdmin: StoryObj<typeof meta> = {
  parameters: {
    msw: [
      mockTrpc({
        team: {
          members: () => members,
          byId: asAdmin,
          changeRole: () => {
            throw new ActionError("team.last-admin", "A team needs at least one admin");
          },
        },
      }),
    ],
  },
  play: async () => {
    await fillForm(page, { "Role of ada@example.com": "viewer" });

    await expect(alert(page)).toHaveText("A team needs at least one admin");
  },
};

export const UnknownEmail: StoryObj<typeof meta> = {
  parameters: {
    msw: [
      mockTrpc({
        team: {
          members: () => members,
          byId: asAdmin,
          addMember: () => {
            throw new ActionError("team.unknown-email", "Nobody with this email has signed up", "team.add-member", "email");
          },
        },
      }),
    ],
  },
  play: async () => {
    await fillForm(page, { Email: "nobody@example.com" });
    await button(page, "Add member").click();

    await expect(text(page, "Nobody with this email has signed up")).toBeVisible();
  },
};

export const TooManyMembers: StoryObj<typeof meta> = {
  parameters: {
    msw: [
      mockTrpc({
        team: {
          members: () => members,
          byId: asAdmin,
          addMember: () => {
            throw new RateLimitedError("Too many requests, try again in 60 seconds", { retryAfter: 60 });
          },
        },
      }),
    ],
  },
  play: async () => {
    await fillForm(page, { Email: "linus@example.com" });
    await button(page, "Add member").click();

    await expect(alert(page)).toHaveText("Too many requests, try again in 60 seconds");
  },
};
```

- `byId` gives each story its role in the team, in `can`. The admin stories get the forms, and the viewer story does not.
- `trpcSpy(path, implementation)` answers like the implementation and records each call. `expect(spy).toHaveBeenCalledWith()` checks the input that the component sent. Its arguments are typed by the router.
- `ActionError(code, message)` is a typed failure of an action, and `RateLimitedError` is a 429. The component shows each one in the place that the real server's error would reach.
- `fillForm` selects an option of a `USelect` by its label. The role selects of the list have the `aria-label` `Role of <email>`.
- The helpers and `expect` come from `@nuxvel/nuxt/storybook/test`. They have the same names as the end-to-end helpers.

```bash
npm run test:ui
```

Each story also gets an accessibility check with axe, with no code. See [Storybook: mocking the server](../storybook.md#mocking-the-server) and [Testing: component tests](../testing.md#component-tests).

## 7. Password reset

The starter has the reset flow already. **Forgot your password?** on `/sign-in` opens `/forgot-password`. It sends the `nuxvel.auth.reset-password` mail with a link to `/reset-password`, which sets the new password. The token in the link works once and expires after one hour. A reset also signs out every session of the user, deletes every API key of the user, and sends the `nuxvel.auth.security-notice` mail.

The request answers the same for an email without an account, and sends no mail. So a visitor cannot use the form to find out who has an account. See [Authentication: account enumeration](../auth.md#account-enumeration). Test both:

```ts
// tests/functional/password-reset.test.ts
import { describe, expect, expectMailSent, expectNoMailSent, guest, it, signIn } from "@nuxvel/nuxt/testing";
import { userFactory } from "#nuxvel/factories";

const post = (path: string, body: object) =>
  guest().fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("password reset", () => {
  it("sets a new password with the token of the mail", async () => {
    const grace = await userFactory.withPassword("old-password-1234")({ emailVerified: true });

    await post("/api/auth/request-password-reset", { email: grace.email, redirectTo: "/reset-password" });
    const { url } = await expectMailSent("nuxvel.auth.reset-password", { to: grace.email });
    const link = new URL(url);
    const redirect = await guest().fetch(link.pathname + link.search, { redirect: "manual" });
    const token = new URL(redirect.headers.get("location") ?? "", link).searchParams.get("token");

    const reset = await post("/api/auth/reset-password", { token, newPassword: "new-password-5678" });

    expect(reset.status).toBe(200);
    await expectMailSent("nuxvel.auth.security-notice", { to: grace.email, change: "password" });
    await signIn(grace.email, "new-password-5678");
    await expect(signIn(grace.email, "old-password-1234")).rejects.toThrow(/refused/);
  });

  it("answers the same for an email without an account, and sends no mail", async () => {
    const response = await post("/api/auth/request-password-reset", { email: "nobody@example.com", redirectTo: "/reset-password" });

    expect(response.status).toBe(200);
    await expectNoMailSent("nuxvel.auth.reset-password");
  });
});
```

The link of the mail goes to `/api/auth/reset-password/<token>`, which sends the browser to `redirectTo` with the token in the query. The test follows the same steps without a browser. `userFactory.withPassword(password)` also writes the credential account, so the user can sign in. The starter's `tests/e2e/home.test.ts` already tests the same flow through the pages. Run `./nv test:functional tests/functional/password-reset.test.ts`. See [Authentication: password reset](../auth.md#password-reset).

## 8. Two-factor sign-in

Every user can turn on two-factor sign-in. After that, a correct password starts no session: the sign-in form then asks for a 6-digit code from an authenticator app, or a backup code. `<AuthForm>` asks for the code itself, so the sign-in page needs no change. The app needs a page where a user turns it on.

### The security page

Add the input schemas of the page to `shared/schemas/security.ts`. The page needs the password and the code. Chapter 13 uses the third schema:

```ts
// shared/schemas/security.ts
import { z } from "zod";

export const passwordInput = z.object({ password: z.string().min(1, "Enter your password") });

export const totpCodeInput = z.object({ code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code") });

export const createApiKeyInput = z.object({ name: z.string().trim().min(1, "Name the key").max(100) });
```

`useTwoFactor()` has one mutation for each step. `enable.mutate(password)` checks the password and returns a TOTP URI and 10 backup codes. The page shows the key of the URI, and the user adds it to an authenticator app. `verify.mutate(code)` with the first code from the app turns two-factor sign-in on. `disable.mutate(password)` turns it off. Each mutation holds the refusal of Better Auth in its `error`:

```vue
<!-- app/components/TwoFactorSettings.vue -->
<script setup lang="ts">
const { user } = useUser();
const { enable, verify, disable, backupCodes } = useTwoFactor();
const setupKey = computed(() => (enable.data ? new URL(enable.data.totpURI).searchParams.get("secret") : null));

const enableState = reactive({ password: "" });
const confirmState = reactive({ code: "" });
const disableState = reactive({ password: "" });

async function turnOff() {
  await disable.mutateAsync(disableState.password).then(enable.reset, () => {});
}
</script>

<template>
  <section class="space-y-4">
    <h2 class="text-lg font-semibold">Two-factor sign-in</h2>
    <template v-if="user?.twoFactorEnabled">
      <p>Two-factor sign-in is on.</p>
      <div v-if="backupCodes.length">
        <p class="text-sm">Keep these backup codes in a safe place. Each code works once.</p>
        <ul class="mt-2 grid grid-cols-2 gap-1 font-mono text-sm" aria-label="Backup codes">
          <li v-for="code in backupCodes" :key="code">{{ code }}</li>
        </ul>
      </div>
      <UForm :schema="passwordInput" :state="disableState" class="flex items-start gap-2" @submit="turnOff">
        <UFormField name="password" label="Password" class="w-64">
          <UInput v-model="disableState.password" type="password" autocomplete="current-password" class="w-full" />
        </UFormField>
        <UButton type="submit" class="mt-6" color="neutral" variant="outline" label="Turn off" />
      </UForm>
      <UAlert v-if="disable.error" role="alert" color="error" variant="subtle" :title="disable.error.message" />
    </template>
    <template v-else-if="enable.data">
      <p class="text-sm">Add this key to your authenticator app, then enter the code that the app shows.</p>
      <UFormField label="Setup key" class="w-80">
        <UInput :model-value="setupKey ?? ''" readonly class="w-full font-mono" />
      </UFormField>
      <UForm :schema="totpCodeInput" :state="confirmState" class="flex items-start gap-2" @submit="verify.mutate(confirmState.code)">
        <UFormField name="code" label="Authentication code" class="w-64">
          <UInput v-model="confirmState.code" autocomplete="one-time-code" class="w-full" />
        </UFormField>
        <UButton type="submit" class="mt-6" label="Confirm" />
      </UForm>
      <UAlert v-if="verify.error" role="alert" color="error" variant="subtle" :title="verify.error.message" />
    </template>
    <template v-else>
      <p class="text-sm">Ask for a code from an authenticator app at each sign-in.</p>
      <UForm :schema="passwordInput" :state="enableState" class="flex items-start gap-2" @submit="enable.mutate(enableState.password)">
        <UFormField name="password" label="Password" class="w-64">
          <UInput v-model="enableState.password" type="password" autocomplete="current-password" class="w-full" />
        </UFormField>
        <UButton type="submit" class="mt-6" label="Turn on" />
      </UForm>
      <UAlert v-if="enable.error" role="alert" color="error" variant="subtle" :title="enable.error.message" />
    </template>
  </section>
</template>
```

Each mutation refreshes `useUser()`. So after the confirmation, `user.twoFactorEnabled` is `true`, and the component shows the backup codes. A refusal of Better Auth shows above the button, as in `<AuthForm>`. See [Authentication: two-factor sign-in](../auth.md#two-factor-sign-in).

Put the component on a page. Chapter 13 adds the API keys to the same page:

```vue
<!-- app/pages/(app)/settings/security.vue -->
<script setup lang="ts">
useSeo({ title: "Security" });
</script>

<template>
  <div class="max-w-2xl space-y-10">
    <h1 class="text-2xl font-semibold">Security</h1>
    <TwoFactorSettings />
    <ApiKeys />
  </div>
</template>
```

Chapter 13 writes `<ApiKeys>`. Until then, leave out the line.

### The user menu

Add a **Security** item to `app/components/UserMenu.vue`. Users with the app role `admin` also get an **Admin** item, for the page of chapter 9. Type the items with `DropdownMenuItem`, so that the conditional item fits the type of the menu:

```vue
<!-- app/components/UserMenu.vue -->
<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";

const { user, isPending, signOut } = useUser();

async function signOutAndLeave() {
  await signOut();
  await navigateTo({ name: "index" });
}

const userMenu = computed<DropdownMenuItem[][]>(() => [
  [{ label: user.value?.email ?? "", type: "label" }],
  [
    { label: "Security", icon: "i-lucide-shield", to: "/settings/security" },
    ...(user.value?.role === "admin" ? [{ label: "Admin", icon: "i-lucide-building", to: "/admin" }] : []),
  ],
  [{ label: "Sign out", icon: "i-lucide-log-out", onSelect: signOutAndLeave }],
]);
</script>
```

The `home` layout of `/` has a copy of this menu. Replace the `<UDropdownMenu>` in `app/layouts/home.vue` with `<UserMenu />`, and remove `signOutAndLeave`, `userMenu` and `signOut` from its script. Then every page has the same menu.

Sign in as the demo user and open **Security** in the user menu. Enter the password `demo-password` and select **Turn on**. Add the setup key to an authenticator app, enter its code and select **Confirm**. The page shows "Two-factor sign-in is on." and the backup codes. Sign out and sign in again. After the password, the form asks for the authentication code.

### Test it

A functional test turns two-factor sign-in on through the same endpoints. It needs a code, so it computes one with `totpCode()` from `@nuxvel/nuxt/testing`, as an authenticator app does. `totpCode()` takes the `totpURI` that `enable` answers, or the setup key the page shows:

```ts
// tests/functional/two-factor.test.ts
import { describe, expect, expectMailSent, expectRow, guest, it, signIn, totpCode } from "@nuxvel/nuxt/testing";
import { userTable } from "#nuxvel/schema";
import { userFactory } from "#nuxvel/factories";

const PASSWORD = "correct-horse-battery";

describe("two-factor sign-in", () => {
  it("turns on with a code from the authenticator app", async () => {
    const ada = await userFactory.withPassword(PASSWORD)({ emailVerified: true });
    const { $fetch } = await signIn(ada.email, PASSWORD);

    const { totpURI, backupCodes } = await $fetch<{ totpURI: string; backupCodes: string[] }>("/api/auth/two-factor/enable", {
      method: "POST",
      body: { password: PASSWORD },
    });
    await $fetch("/api/auth/two-factor/verify-totp", { method: "POST", body: { code: totpCode(totpURI) } });

    expect(backupCodes).toHaveLength(10);
    await expectRow(userTable, { id: ada.id, twoFactorEnabled: true });
    await expectMailSent("nuxvel.auth.security-notice", { to: ada.email, change: "two-factor-on" });
  });

  it("starts no session after the password alone", async () => {
    const ada = await userFactory.withPassword(PASSWORD)({ emailVerified: true, twoFactorEnabled: true });

    const response = await guest().fetch("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: ada.email, password: PASSWORD }),
    });

    expect(await response.json()).toMatchObject({ twoFactorRedirect: true });
    await expect(signIn(ada.email, PASSWORD)).rejects.toThrow(/two-factor/);
  });
});
```

`signIn()` returns `$fetch` on the session of the sign-in, so the test calls the Better Auth endpoints as that user. The second test gives the factory `twoFactorEnabled: true`. `signIn()` throws for such a user, because the sign-in starts no session.

The component has four states. A story gives each state with `mockUser`, which answers the session of `useUser()`. The Better Auth calls are not tRPC calls, so the stories answer them with an MSW handler:

```ts
// app/components/TwoFactorSettings.stories.ts
import type { Meta, StoryObj } from "@storybook-vue/nuxt";
import { http, HttpResponse } from "msw";
import { mockUser } from "@nuxvel/nuxt/storybook/mocks";
import { alert, button, expect, field, page, text } from "@nuxvel/nuxt/storybook/test";
import TwoFactorSettings from "./TwoFactorSettings.vue";

const meta = { component: TwoFactorSettings } satisfies Meta<typeof TwoFactorSettings>;
export default meta;

const enable = (body: object, status = 200) => http.post("*/api/auth/two-factor/enable", () => HttpResponse.json(body, { status }));

export const Off: StoryObj<typeof meta> = {
  parameters: { msw: [mockUser({ twoFactorEnabled: false })] },
  play: async () => {
    await expect(button(page, "Turn on")).toBeVisible();
  },
};

export const On: StoryObj<typeof meta> = {
  parameters: { msw: [mockUser({ twoFactorEnabled: true })] },
  play: async () => {
    await expect(text(page, "Two-factor sign-in is on.")).toBeVisible();
    await expect(button(page, "Turn off")).toBeVisible();
  },
};

export const ShowsTheSetupKey: StoryObj<typeof meta> = {
  parameters: {
    msw: [
      mockUser({ twoFactorEnabled: false }),
      enable({ totpURI: "otpauth://totp/Invoices:ada%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Invoices", backupCodes: ["a1b2c-d3e4f"] }),
    ],
  },
  play: async () => {
    await field(page, "Password").fill("correct-horse-battery");
    await button(page, "Turn on").click();

    await expect(field(page, "Setup key")).toHaveValue("JBSWY3DPEHPK3PXP");
    await expect(field(page, "Authentication code")).toBeVisible();
  },
};

export const WrongPassword: StoryObj<typeof meta> = {
  parameters: { msw: [mockUser({ twoFactorEnabled: false }), enable({ code: "INVALID_PASSWORD", message: "Invalid password" }, 400)] },
  play: async () => {
    await field(page, "Password").fill("not-my-password");
    await button(page, "Turn on").click();

    await expect(alert(page)).toHaveText("Invalid password");
  },
};
```

The user menu shows the **Admin** item only for the app role `admin`. Add a story for each role to `app/components/UserMenu.stories.ts`. Each story gives the user with `mockUser`:

```ts
// app/components/UserMenu.stories.ts
export const AdminSeesTheAdminPage: StoryObj<typeof meta> = {
  parameters: { msw: [mockUser({ email: "root@example.com", role: "admin" })] },
  play: async () => {
    await button(page, "root@example.com").click();

    await expect(menuitem(page, "Admin")).toBeVisible();
    await expect(menuitem(page, "Security")).toBeVisible();
  },
};

export const UserDoesNotSeeTheAdminPage: StoryObj<typeof meta> = {
  parameters: { msw: [ada] },
  play: async () => {
    await button(page, "ada@example.com").click();

    await expect(menuitem(page, "Security")).toBeVisible();
    await expect(menuitem(page, "Admin")).toBeHidden();
  },
};
```

`ada` is the `mockUser({ email: "ada@example.com" })` of the starter's stories, with the default role `user`. Run `./nv test:functional tests/functional/two-factor.test.ts` and `npm run test:ui`.

## 9. Admin tools

The staff of the app needs a page with every team of every customer. That page reads across tenants, so it needs the strongest checks of the app.

### `adminProcedure`

`adminProcedure` is an `authedProcedure` that also needs the app role `admin` and a session that passed two-factor sign-in. It refuses an API key. Write the router:

```bash
./nv make:router admin
```

```ts
// server/trpc/routers/admin.router.ts
import { count, desc, eq, getTableColumns } from "drizzle-orm";
import { z } from "zod";
import { membershipTable, teamTable } from "#nuxvel/schema";

export const adminRouter = {
  teams: adminProcedure
    .output(z.array(teamSchema.extend({ members: z.number() })))
    .query(() =>
      useDb()
        .select({ ...getTableColumns(teamTable), members: count(membershipTable.id) })
        .from(teamTable)
        .leftJoin(membershipTable, eq(membershipTable.teamId, teamTable.id))
        .groupBy(teamTable.id)
        .orderBy(desc(teamTable.createdAt))
        .limit(100),
    ),
};
```

The page shows the teams in a table:

```vue
<!-- app/pages/(app)/admin.vue -->
<script setup lang="ts">
const teams = useQuery({ ...$api.admin.teams.queryOptions(), ssrCatchError: true });

useSeo({ title: "Admin" });
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-semibold">All teams</h1>
    <QueryState :query="teams">
      <template #default="{ data }">
        <UTable :data="data" :columns="[{ accessorKey: 'name', header: 'Team' }, { accessorKey: 'members', header: 'Members' }]" />
      </template>
    </QueryState>
  </div>
</template>
```

An admin without a second factor gets `FORBIDDEN` from the query. Without `ssrCatchError: true`, an error of a query while the server renders the page opens the error page with HTTP 500. With it, `<QueryState>` shows the message of the error: "Sign in with a second factor to use admin tools".

Sign-up cannot set the app role. To make the demo user an admin, update the row in `./nv tinker`:

```bash
./nv tinker
```

```
nuxvel> const { eq } = await import("drizzle-orm")
nuxvel> await useDb().update(userTable).set({ role: "admin" }).where(eq(userTable.email, "demo@example.com")).returning({ email: userTable.email, role: userTable.role })
[ { email: 'demo@example.com', role: 'admin' } ]
```

Sign in again. The user menu has **Admin**. Open it. Without two-factor sign-in, the page shows "Sign in with a second factor to use admin tools". Turn on two-factor sign-in, sign out and sign in with a code. The page lists Acme and Globex. A session from before two-factor sign-in was on does not count, so sign in again after you turn it on.

### `freshProcedure`

A team admin deletes the team, and its invoices go with it. A stolen session must not be enough for that. Chapter 5 gave `team.delete` the builder `freshProcedure`. It needs a sign-in in the last 10 minutes. An older session gets `FORBIDDEN` with the message "Sign in again to continue", and the alert of the team list shows it. It also refuses an API key.

### Test the admin tools

```ts
// server/trpc/routers/admin.router.test.ts
import { actingAs, describe, expect, expectRefused, guest, it } from "@nuxvel/nuxt/testing";
import { team } from "../../../tests/scenarios/team";
import { userFactory } from "#nuxvel/factories";

describe("admin router", () => {
  it("lists every team, with its member count, for an admin with a second factor", async () => {
    const t = await team();
    const admin = await userFactory({ role: "admin", twoFactorEnabled: true });

    expect(await actingAs(admin).api.admin.teams()).toEqual([expect.objectContaining({ id: t.team.id, members: 3 })]);
  });

  it("refuses users and guests", async () => {
    const t = await team();

    await expectRefused(actingAs(t.admin).api.admin, "FORBIDDEN");
    await expectRefused(guest().api.admin, "UNAUTHORIZED");
  });

  it.for([
    { name: "a session without a second factor", options: { twoFactorVerified: false } },
    { name: "an API key", options: { apiKey: true } },
  ])("refuses an admin with $name", async ({ options }) => {
    const admin = await userFactory({ role: "admin", twoFactorEnabled: true });

    await expect(actingAs(admin, options).api.admin.teams()).rejects.toBeTrpcError("FORBIDDEN");
  });

  it("refuses an admin without two-factor sign-in", async () => {
    const admin = await userFactory({ role: "admin" });

    await expect(actingAs(admin).api.admin.teams()).rejects.toBeTrpcError("FORBIDDEN");
  });
});
```

- `actingAs(user)` counts as two-factor verified when the user has `twoFactorEnabled`. `twoFactorVerified: false` gives the session of an admin who signed in with the password only.
- `apiKey: true` signs each call in with a new API key of the user, in place of a session.
- The team admin of the scenario has the app role `user`. A team role gives no access to the admin tools.

`actingAs()` always counts as a fresh sign-in. To test `freshProcedure`, the test needs a real session with a real age. `signIn()` gives one, and `travelBy()` moves the clock of the app:

```ts
// tests/functional/fresh-sign-in.test.ts
import { describe, expect, expectNoRow, it, signIn, travelBy } from "@nuxvel/nuxt/testing";
import { teamTable } from "#nuxvel/schema";
import { membershipFactory, teamFactory, userFactory } from "#nuxvel/factories";

const PASSWORD = "correct-horse-battery";

async function adminOfATeam() {
  const ada = await userFactory.withPassword(PASSWORD)({ emailVerified: true });
  const row = await teamFactory({ ownerId: ada.id });
  await membershipFactory({ teamId: row.id, userId: ada.id, role: "admin" });

  return { ada, team: row };
}

describe("deleting a team", () => {
  it("works within 10 minutes of the sign-in", async () => {
    const { ada, team } = await adminOfATeam();
    const { api } = await signIn(ada.email, PASSWORD);

    await travelBy({ minutes: 9 });
    await api.team.delete({ id: team.id });

    await expectNoRow(teamTable, { id: team.id });
  });

  it("asks for a new sign-in after 10 minutes", async () => {
    const { ada, team } = await adminOfATeam();
    const { api } = await signIn(ada.email, PASSWORD);

    await travelBy({ minutes: 11 });

    await expect(api.team.delete({ id: team.id })).rejects.toBeTrpcError("FORBIDDEN");
  });
});
```

Run `./nv test:functional server/trpc tests/functional/fresh-sign-in.test.ts`. See [Authentication: admin procedures](../auth.md#admin-procedures) and [Authentication: recent sign-in procedures](../auth.md#recent-sign-in-procedures).

## 10. Social login

Users can also sign in with GitHub. Turn the provider on in `nuxt.config.ts`. The starter has the line as a comment:

```ts
// nuxt.config.ts
    auth: {
      signInPath: '/sign-in',
      // Each provider reads NUXT_AUTH_<PROVIDER>_CLIENT_ID and _CLIENT_SECRET from .env.
      social: { github: true },
    },
```

Register an OAuth app at GitHub with the callback URL of the dev server, for example `https://invoices.localhost/api/auth/callback/github`. Put its client ID and secret in `.env`:

```sh
NUXT_AUTH_GITHUB_CLIENT_ID=Iv1.0123456789abcdef
NUXT_AUTH_GITHUB_CLIENT_SECRET=0123456789abcdef0123456789abcdef01234567
```

A server of a production build does not start while a provider has no client ID or secret. The test build is a production build, so the tests need the two variables too. The test setup reads them from `.env`. The CI workflow of the starter copies `.env.example` to `.env`. So also add the two variables, with any value, to the `env` of `.github/workflows/ci.yml`, next to `NUXT_AUTH_SECRET`. See [Authentication: registering the OAuth app](../auth.md#registering-the-oauth-app).

`<AuthForm>` shows a **Continue with GitHub** button under the sign-in and sign-up forms. A click sends the browser to GitHub. GitHub sends the user back to `/api/auth/callback/github`, and Better Auth creates the user on the first sign-in. A user with two-factor sign-in on comes back to the sign-in page, which asks for the code.

### Test it without GitHub

A test cannot sign in at GitHub. It can test the two halves of the flow in the app:

- The start of the sign-in must send the browser to GitHub with the client ID of the app.
- The callback must exchange the code for a token and read the user from the GitHub API. `fakeFetch()` answers these requests of the server in place of GitHub.

```ts
// tests/functional/social-login.test.ts
import { describe, expect, expectRow, fakeFetch, guest, it } from "@nuxvel/nuxt/testing";
import { accountTable, userTable } from "#nuxvel/schema";

const github = {
  "https://github.com/login/oauth/access_token": { body: { access_token: "gho_test", token_type: "bearer", scope: "user:email" } },
  "https://api.github.com/user": { body: { id: 4242, login: "ada", name: "Ada", email: "ada@example.com", avatar_url: "https://avatars.githubusercontent.com/u/4242" } },
  "https://api.github.com/user/emails": { body: [{ email: "ada@example.com", primary: true, verified: true }] },
};

async function startGitHubSignIn() {
  const response = await guest().fetch("/api/auth/sign-in/social", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider: "github", callbackURL: "/" }),
  });
  const { url } = (await response.json()) as { url: string };
  const cookie = response.headers.getSetCookie().map((pair) => pair.split(";")[0]).join("; ");

  return { authorize: new URL(url), cookie };
}

describe("sign-in with GitHub", () => {
  it("sends the browser to GitHub with the client ID of the OAuth app", async () => {
    const { authorize } = await startGitHubSignIn();

    expect(`${authorize.origin}${authorize.pathname}`).toBe("https://github.com/login/oauth/authorize");
    expect(authorize.searchParams.get("client_id")).toBe(process.env.NUXT_AUTH_GITHUB_CLIENT_ID);
    expect(authorize.searchParams.get("redirect_uri")).toMatch(/\/api\/auth\/callback\/github$/);
  });

  it("creates a user and signs them in when GitHub sends them back", async () => {
    await fakeFetch(github);
    const { authorize, cookie } = await startGitHubSignIn();

    const callback = await guest().fetch(`/api/auth/callback/github?code=test-code&state=${authorize.searchParams.get("state")}`, {
      headers: { cookie },
      redirect: "manual",
    });

    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe("/");
    expect(callback.headers.getSetCookie().some((pair) => pair.includes("session_token="))).toBe(true);
    const ada = await expectRow(userTable, { email: "ada@example.com", emailVerified: true });
    await expectRow(accountTable, { userId: ada.id, providerId: "github", accountId: "4242" });
  });
});
```

The start of the sign-in sets a cookie with the state of the flow. The browser sends it back with the callback, so the test sends it too. The `state` in the URL must match the cookie. `fakeFetch()` fakes every `fetch()` of the app under test with an absolute URL, for the rest of the test. A request that no key matches fails, so nothing reaches GitHub. See [Testing: faking outbound requests](../testing.md#faking-outbound-requests).

The test does not check the GitHub page or your OAuth app. Sign in once with your OAuth app in the browser to check them. Run `./nv test:functional tests/functional/social-login.test.ts`. See [Authentication: social login](../auth.md#social-login).

## 11. Audit log

The audit log records who changed what, and when. It is for compliance: the app never reads it. Chapter 4 already writes these rows:

| Action | Target | Written by |
|---|---|---|
| `team.created`, `team.deleted` | the team | the generated team actions |
| `invoice.created`, `invoice.deleted` | the invoice | the generated invoice actions |
| `membership.added` | the membership, with the team and the role in `metadata` | `add-member` |
| `membership.role-changed` | the membership, with the role in `changes` | `change-role` |

`audit(action, target, options)` writes the row in the transaction of the action, with the actor of the action. If the action fails after it, the row rolls back with the change.

For an invoice update, the log must show the columns that changed. Add the `audit` option to the update action, after `input`:

```ts
// server/actions/invoice/update-invoice.action.ts, in defineAction
  audit: { name: "invoice.updated", target: invoiceTable },
```

The action loads the row of `input.id` before and after the handler. It writes only the changed columns, as `{ column: { from, to } }`. A call that fails writes no row.

The log keeps no user ID. It stores a subject ID in place of each user, so `nuxvel user:erase` can remove the personal data and keep the chain. A hash chain links each row to the row before it, and `nuxvel audit:verify` finds a changed row. `nuxvel audit:tail` prints each new row, and `nuxvel audit:export` prints the rows of a time range. Chapter 13 exports the rows that an API key writes. The seeder writes rows with factories, not with actions, so it writes no audit rows.

`expectAudited(action, match)` finds an audit row and returns it. Give it a user ID as `actorId`, and it matches the subject ID of that user:

```ts
// tests/functional/audit.test.ts
import { actingAs, describe, expect, expectAudited, expectNotAudited, expectRow, it, runAction } from "@nuxvel/nuxt/testing";
import { membershipTable } from "#nuxvel/schema";
import { team } from "../scenarios/team";

describe("the audit log", () => {
  it("records the columns that an invoice update changed", async () => {
    const t = await team();

    await actingAs(t.member).api.invoice.update({ id: t.invoice.id, status: "paid" });

    const entry = await expectAudited("invoice.updated", { actorId: t.member.id, targetId: String(t.invoice.id) });
    expect(entry.changes).toEqual({ status: { from: "draft", to: "paid" } });
  });

  it("writes no row for an update that the policy refuses", async () => {
    const t = await team();

    await expect(actingAs(t.viewer).api.invoice.update({ id: t.invoice.id, status: "paid" })).rejects.toBeTrpcError("FORBIDDEN");

    await expectNotAudited("invoice.updated");
  });

  it("records who changed a role, and from what to what", async () => {
    const t = await team();
    const viewer = await expectRow(membershipTable, { teamId: t.team.id, userId: t.viewer.id });

    await runAction("team.change-role", { membershipId: viewer.id, role: "member" }, { actingAs: t.admin });

    const entry = await expectAudited("membership.role-changed", { actorId: t.admin.id, targetId: String(viewer.id) });
    expect(entry.changes).toEqual({ role: { from: "viewer", to: "member" } });
  });
});
```

Run `./nv test:functional tests/functional/audit.test.ts`. See [Audit log](../audit.md).

## 12. Rate limits

nuxvel counts attempts in Redis, so all instances of the app share one count. The auth endpoints already have limits. A sign-in and a sign-up spend the `login` limit of the client IP: 5 attempts a minute. Over the limit, the endpoint answers HTTP 429. See [Authentication: rate limiting](../auth.md#rate-limiting).

The app adds one limit of its own. An admin could use the member form to find out which email addresses have an account, because an unknown email gives `team.unknown-email`. Chapter 5 limits `team.addMember` to 10 calls an hour for each user:

```ts
// server/trpc/routers/team.router.ts
  addMember: authedProcedure
    .use(rateLimit({ points: 10, window: { hours: 1 }, by: "user" }))
```

The 11th call in an hour gets `TOO_MANY_REQUESTS`, and the form of chapter 6 shows the message. `by: "user"` gives each user a budget. `by: "ip"` and a key function are the other choices. See [Security: rate limiting](../security.md#rate-limiting).

`exhaustRateLimit()` spends every attempt of a limit, so a test does not make 10 calls first. Give it the procedure of a test client to spend the `rateLimit()` of that procedure for that client. Give it a limit name and an identity to spend a shared limit, such as `login`:

```ts
// tests/functional/rate-limits.test.ts
import { actingAs, describe, exhaustRateLimit, expect, guest, it } from "@nuxvel/nuxt/testing";
import { userFactory } from "#nuxvel/factories";
import { team } from "../scenarios/team";

describe("rate limits", () => {
  it("lets one admin add at most 10 members an hour", async () => {
    const t = await team();
    const { api } = actingAs(t.admin);

    await exhaustRateLimit(api.team.addMember);

    await expect(api.team.addMember({ teamId: t.team.id, email: t.outsider.email, role: "viewer" })).rejects.toBeTrpcError(
      "TOO_MANY_REQUESTS",
    );
  });

  it("counts the budget for each admin", async () => {
    const t = await team();
    await exhaustRateLimit(actingAs(t.admin).api.team.addMember);

    const other = await userFactory();
    const ours = await actingAs(other).api.team.create({ name: "Globex" });

    await expect(actingAs(other).api.team.addMember({ teamId: ours.id, email: t.outsider.email, role: "viewer" })).resolves.toMatchObject({
      role: "viewer",
    });
  });

  it("answers 429 to a sign-in from an IP that used up the login limit", async () => {
    await exhaustRateLimit("login", { ip: "127.0.0.1" });

    const response = await guest().fetch("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "ada@example.com", password: "correct-horse-battery" }),
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("x-retry-after")).toMatch(/^\d+$/);
  });
});
```

The test client reaches the server from `127.0.0.1`, so the third test spends the budget of that IP. The setup clears the counts after each test. Run `./nv test:functional tests/functional/rate-limits.test.ts`. See [Security: testing](../security.md#testing).

## 13. API keys and the OpenAPI document

An accounting system reads the invoices of a team and adds new ones. It calls the REST endpoints of the invoice router with an API key.

### The OpenAPI document

The invoice router of chapter 3 has `openapi` meta on each procedure, so each procedure is also a REST endpoint under `/api/v1`. Turn on the OpenAPI document in `nuxt.config.ts`. The starter has the line as a comment. Also give the app its name for the title template and the installable app:

```ts
// nuxt.config.ts
    seo: { siteName: 'Invoices', defaultDescription: 'Invoices for teams.', ogImage: true },
    pwa: {
      name: 'Invoices',
```

```ts
// nuxt.config.ts
    api: { openapi: { title: 'Invoices API', version: '1.0.0' } },
```

`/api/v1/openapi.json` is now the OpenAPI 3.1 document of the endpoints, and `/api/v1/docs` shows it as an API reference in development. `npm run dev` prints the address:

```
  App        http://localhost:3917
  DevTools   http://localhost:3917/__nuxt_devtools__/client/
  API docs   http://localhost:3917/api/v1/docs
```

This output is from `./nv dev --no-https --port 3917`. With the default `npm run dev`, the app is at `https://invoices.localhost`. See [REST and OpenAPI](../openapi.md).

### Keys for users

nuxvel adds the `apiKeys` router to the app. It creates, lists and revokes the keys of the signed-in user. A key acts as its owner: `ctx.user` is the owner and `ctx.actor` is the key. The app is already ready for keys:

- The reads of chapter 5 use `ctx.user.id`, so a key reads the teams of its owner.
- The actions and the policies use `ctx.actor.userId`, so a key has the team roles of its owner.
- The audit log records the key as the actor.
- `adminProcedure` and `freshProcedure` refuse a key. So a stolen key cannot use the admin tools or delete a team.

Add a component for the keys to the security page of chapter 8:

```vue
<!-- app/components/ApiKeys.vue -->
<script setup lang="ts">
const keys = $api.apiKeys.list.useQuery();
const newKey = ref<string>();

const form = useActionForm($api.apiKeys.create, {
  defaults: { name: "" },
  onSuccess: (created) => {
    newKey.value = created.key;
  },
});

const { mutate: revoke } = $api.apiKeys.revoke.useMutation();
</script>

<template>
  <section class="space-y-4">
    <h2 class="text-lg font-semibold">API keys</h2>
    <UAlert v-if="newKey" color="neutral" variant="subtle" title="Copy the key now. It does not show again.">
      <template #description>
        <code class="break-all">{{ newKey }}</code>
      </template>
    </UAlert>
    <UForm :ref="form.ref" :schema="form.schema" :state="form.state" class="flex items-start gap-2" @submit="form.submit">
      <UFormField name="name" label="Key name" class="w-64">
        <UInput v-model="form.state.name" class="w-full" />
      </UFormField>
      <UButton type="submit" class="mt-6" :loading="form.pending" label="Create key" />
    </UForm>
    <QueryState :query="keys">
      <template #empty>
        <p class="text-sm text-muted">No API keys yet.</p>
      </template>
      <template #default="{ data }">
        <ul class="divide-y divide-default">
          <li v-for="key in data" :key="key.id" class="flex items-center justify-between gap-4 py-2">
            <span>{{ key.name }}</span>
            <UButton color="error" variant="outline" size="sm" :aria-label="`Revoke ${key.name}`" label="Revoke" @click="revoke({ id: key.id })" />
          </li>
        </ul>
      </template>
    </QueryState>
  </section>
</template>
```

`apiKeys.create` returns the key once. nuxvel stores only a hash of it. `createApiKeyInput` from chapter 8 checks the name in the browser. Add `<ApiKeys />` to `app/pages/(app)/settings/security.vue` under `<TwoFactorSettings />`.

### Call the API

Create a key on the security page, or issue one with the CLI for a user ID:

```bash
./nv key:issue 068b94d1-66e2-4116-a94b-5fd0ca1fbcde --name accounting
```

```
nxk_b-vx8ggFsjcufNpwiiNWOCSaNSmHRLpWDX191numuLw
✔ Issued the API key "accounting" for user 068b94d1-66e2-4116-a94b-5fd0ca1fbcde. Store it now: it is not shown again
```

The key of the demo user reads the invoices of Acme, and only of Acme:

```bash
curl "http://localhost:3917/api/v1/invoice?perPage=2" -H "Authorization: Bearer nxk_b-vx8ggFsjcufNpwiiNWOCSaNSmHRLpWDX191numuLw"
```

```json
{"rows":[{"id":5,"ownerId":"068b94d1-66e2-4116-a94b-5fd0ca1fbcde","customer":"Turcotte, Streich and Turcotte","amount":199113,"status":"draft","teamId":1,"createdAt":"2026-10-02T14:39:08.972Z","updatedAt":"2026-10-02T14:39:08.972Z"},{"id":4,"ownerId":"068b94d1-66e2-4116-a94b-5fd0ca1fbcde","customer":"Reynolds, Schaefer and Friesen","amount":132607,"status":"draft","teamId":1,"createdAt":"2026-10-02T14:39:08.972Z","updatedAt":"2026-10-02T14:39:08.972Z"}],"page":1,"perPage":2,"total":5,"lastPage":3}
```

A new invoice for Globex, team 2, gets `NOT_FOUND`, because the demo user is not in that team. A new invoice for Acme, team 1, works:

```bash
curl -X POST http://localhost:3917/api/v1/invoice -H "Authorization: Bearer nxk_b-vx8ggFsjcufNpwiiNWOCSaNSmHRLpWDX191numuLw" -H "content-type: application/json" -d '{"teamId":2,"customer":"Initech","amount":120000}'
curl -X POST http://localhost:3917/api/v1/invoice -H "Authorization: Bearer nxk_b-vx8ggFsjcufNpwiiNWOCSaNSmHRLpWDX191numuLw" -H "content-type: application/json" -d '{"teamId":1,"customer":"Initech","amount":120000}'
```

```json
{"message":"Query returned no rows","code":"NOT_FOUND","data":{"code":"NOT_FOUND","httpStatus":404,"path":"invoice.create"}}
{"id":9,"ownerId":"068b94d1-66e2-4116-a94b-5fd0ca1fbcde","customer":"Initech","amount":120000,"status":"draft","teamId":1,"createdAt":"2026-10-02T14:42:19.299Z","updatedAt":"2026-10-02T14:42:19.299Z"}
```

A request without a key, or with an unknown key, gets HTTP 401. Each key can make 60 calls a minute, the built-in `api-key` limit. See [REST and OpenAPI: API keys](../openapi.md#api-keys).

Mark the new invoice as paid, then read the audit log:

```bash
curl -X PATCH http://localhost:3917/api/v1/invoice/9 -H "Authorization: Bearer nxk_b-vx8ggFsjcufNpwiiNWOCSaNSmHRLpWDX191numuLw" -H "content-type: application/json" -d '{"status":"paid"}'
./nv audit:export --from 2026-10-01 --format csv
./nv audit:verify
```

```
id,occurredAt,actorType,actorId,action,targetType,targetId,changes,metadata,requestId,prevHash,hash
1,2026-10-02T14:42:19.303Z,api-key,525a9554-0bc8-4957-8292-400c44cb6278,invoice.created,invoice,9,,,15a5af0e-51c7-4c34-995f-774f2687c375,,68e3ed9220573bf6db1e7129874d96a85d1b74c6400139efb18433d10faa7f89
2,2026-10-02T14:53:00.372Z,api-key,525a9554-0bc8-4957-8292-400c44cb6278,invoice.updated,invoice,9,"{""status"":{""to"":""paid"",""from"":""draft""}}",,73f84422-ced5-4095-a2f8-36f7f7217b18,68e3ed9220573bf6db1e7129874d96a85d1b74c6400139efb18433d10faa7f89,182ba25b3edfd7cf61a0b95c808753d636c3947fb0447fa765325f9ad9227957
✔ Audit chain intact: 2 rows verified
```

The actor of both rows is the key, not the user. The `audit` option of the update action in chapter 11 wrote the changed column of the update. The `prevHash` of row 2 is the `hash` of row 1.

### Test the API

`actingAs(user, { apiKey: true })` signs each call in with a new API key of the user. Its `$fetch` and `fetch` call the REST endpoints:

```ts
// tests/functional/api-keys.test.ts
import { actingAs, describe, expect, expectAudited, guest, it } from "@nuxvel/nuxt/testing";
import { team } from "../scenarios/team";

describe("the REST API with an API key", () => {
  it("lists only the invoices of the teams of the key's owner", async () => {
    const ours = await team();
    await team();

    const page = await actingAs(ours.viewer, { apiKey: true }).$fetch<{ rows: { id: number }[] }>("/api/v1/invoice");

    expect(page.rows.map((row) => row.id)).toEqual([ours.invoice.id]);
  });

  it("creates an invoice for the key's owner and records the key in the audit log", async () => {
    const t = await team();

    const created = await actingAs(t.member, { apiKey: true }).$fetch<{ id: number; ownerId: string }>("/api/v1/invoice", {
      method: "POST",
      body: { teamId: t.team.id, customer: "Initech", amount: 120_000 },
    });

    expect(created.ownerId).toBe(t.member.id);
    await expectAudited("invoice.created", { actorType: "api-key", targetId: String(created.id) });
  });

  it("keeps the role rules of the owner", async () => {
    const t = await team();

    const response = await actingAs(t.viewer, { apiKey: true }).fetch("/api/v1/invoice", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ teamId: t.team.id, customer: "Initech", amount: 120_000 }),
    });

    expect(response.status).toBe(403);
  });

  it("refuses a request without a key", async () => {
    expect((await guest().fetch("/api/v1/invoice")).status).toBe(401);
  });

  it("does not let a key create more keys", async () => {
    const t = await team();

    await expect(actingAs(t.admin, { apiKey: true }).api.apiKeys.create({ name: "ci" })).rejects.toBeTrpcError("FORBIDDEN");
  });

  it("describes the invoice endpoints in the OpenAPI document", async () => {
    const document = await guest().$fetch<{ info: { title: string }; paths: Record<string, object> }>("/api/v1/openapi.json");

    expect(document.info.title).toBe("Invoices API");
    expect(Object.keys(document.paths)).toEqual(expect.arrayContaining(["/invoice", "/invoice/{id}"]));
  });
});
```

The second test proves that the owner of a new invoice is the user, not the key. With `ctx.actor.id`, the action would write the ID of the key into `owner_id`, and the foreign key to `user` would refuse it. Run `./nv test:functional tests/functional/api-keys.test.ts`.

## 14. Testing

Run the functional tests and the component tests:

```bash
npm run test:functional
npm run test:ui
```

```
◇ Dev services are already healthy (docker compose)
◇ Built the app for tests: server/policies/team.policy.ts changed (23.1s)

 Test Files  18 passed (18)
      Tests  76 passed (76)
```

```
 Test Files  4 passed (4)
      Tests  16 passed (16)
```

`npm test` runs both. Each test file gets its own copy of the test database and its own Redis database, and the setup empties the tables after each test. See [Testing](../testing.md).

### The journey in a browser

The functional tests check each step of the auth flows on the server. One end-to-end test follows a new user through the pages, with the real server and the real mail link. The user signs up, confirms the email, turns on two-factor sign-in and signs in again with a code:

```ts
// tests/e2e/two-factor.test.ts
import { button, describe, expect, expectMailSent, field, fillForm, heading, it, menuitem, text, totpCode, visit } from "@nuxvel/nuxt/testing";

process.env.NUXT_AUTH_REQUIRE_EMAIL_VERIFICATION = "true";

describe("a new account in a browser", () => {
  it("signs up, confirms the email, turns on two-factor sign-in and signs in with a code", async () => {
    const email = "ada@example.com";
    const password = "correct-horse-battery";

    const signUp = await visit({ name: "sign-up" });
    await fillForm(signUp, { Name: "Ada", Email: email, Password: password });
    await button(signUp, "Sign up").click();
    await expect(heading(signUp, "Confirm your email address")).toBeVisible();

    const { url } = await expectMailSent("nuxvel.auth.verify-email", { to: email });
    const page = await visit(url);
    await expect(text(page, `Signed in as ${email}.`)).toBeVisible();

    await button(page, email).click();
    await menuitem(page, "Security").click();
    await expect(heading(page, "Security")).toBeVisible();
    await fillForm(page, { Password: password });
    await button(page, "Turn on").click();
    const setupKey = await field(page, "Setup key").inputValue();
    await fillForm(page, { "Authentication code": totpCode(setupKey) });
    await button(page, "Confirm").click();
    await expect(text(page, "Two-factor sign-in is on.")).toBeVisible();
    await expect(page.getByRole("list", { name: "Backup codes" }).getByRole("listitem")).toHaveCount(10);
    await expectMailSent("nuxvel.auth.security-notice", { to: email, change: "two-factor-on" });

    const signIn = await visit({ name: "sign-in" });
    await fillForm(signIn, { Email: email, Password: password });
    await button(signIn, "Sign in").click();
    await fillForm(signIn, { "Authentication code": totpCode(setupKey) });
    await button(signIn, "Verify").click();
    await expect(text(signIn, `Signed in as ${email}.`)).toBeVisible();
  });
});
```

- `visit(target)` opens a page in a new browser context and waits for hydration. It takes a typed route location, such as `{ name: "sign-up" }`, or a full URL, such as the link of a mail.
- The test sets `NUXT_AUTH_REQUIRE_EMAIL_VERIFICATION` at its top, as the functional test of chapter 2 does.
- Each `visit()` opens a new browser context with no cookies. So the last `visit()` starts signed out, and the sign-in really needs the code.
- `visit` fails the test on each page error, `console.error` message and failed request. So the test also proves that the pages have no errors.

Two more browser tests check the team page as a team admin, and the admin page as a platform admin. `actingAs(user).visit()` opens a page signed in, without the sign-in form:

```ts
// tests/e2e/team.test.ts
import { actingAs, button, cell, describe, expect, fillForm, heading, it, text, toast } from "@nuxvel/nuxt/testing";
import { userFactory } from "#nuxvel/factories";
import { team } from "../scenarios/team";

describe("the team pages in a browser", () => {
  it("lets a team admin add a member", async () => {
    const t = await team();

    const page = await actingAs(t.admin).visit({ name: "team-id", params: { id: t.team.id } });
    await expect(heading(page, t.team.name)).toBeVisible();
    await fillForm(page, { Email: t.outsider.email, Role: "viewer" });
    await button(page, "Add member").click();

    await expect(toast(page, "Member added")).toBeVisible();
    await expect(text(page, t.outsider.email)).toBeVisible();
  });

  it("shows every team to a platform admin who signed in with a second factor", async () => {
    const t = await team();
    const root = await userFactory({ role: "admin", twoFactorEnabled: true });

    const page = await actingAs(root).visit({ name: "admin" });

    await expect(cell(page, t.team.name)).toBeVisible();
  });

  it("asks a platform admin without a second factor to sign in with one", async () => {
    const root = await userFactory({ role: "admin" });

    const page = await actingAs(root).visit({ name: "admin" });

    await expect(text(page, "Sign in with a second factor to use admin tools")).toBeVisible();
  });
});
```

The last test fails without `ssrCatchError: true` in `app/pages/(app)/admin.vue`: `visit` records the HTTP 500 of the error page. Run the browser tests:

```bash
npm run test:e2e
```

```
◇ Dev services are already healthy (docker compose)
◇ Using the test build from 03/10/2026, 12:54:33 am

 Test Files  3 passed (3)
      Tests  8 passed (8)
```

The starter's `tests/e2e/home.test.ts` also opens each page without params, with `expectNoSmoke()`. The new pages need a session, so the smoke test sees each one send a guest to the sign-in page.

### Types and architecture rules

```bash
npm run typecheck
npm run test:arch
```

```
✔ All architecture rules pass
```

`npm run typecheck` runs `nuxt typecheck`, and exits 0 with no output. `npm run test:arch` checks the rules of the framework. For example, each action has its own file. Each table with a `userId` column has a declaration in `server/privacy/`. Each test takes `expect` from a nuxvel entry. See [CLI: `nuxvel test:arch`](../cli.md#nuxvel-testarch).

## What this tutorial leaves out

The app adds only users who signed up before. An admin cannot remove a member. A real app sends an invitation mail with a signed link. See [Mail](../mail.md) and [Security: signed URLs](../security.md#signed-urls). The admin tools only read. A page that changes the data of a customer must also write an audit row with the staff member as the actor.
