# Audit log

## Introduction

The audit log records who changed what, and when. Each call to `audit()` appends one row to the `audit_log` table. The table is append-only, and a hash chain keyed by a secret outside the database shows if somebody with access to the database rewrites rows. Write an audit row for each change that matters, for example when a user publishes or deletes a post.

## Writing an audit row

```ts
// server/actions/posts/create-post.action.ts
import { postTable } from "#nuxvel/schema";

export const createPostAction = defineAction({
  input: createPostInput,
  handler: async (input, { actor }) => {
    const post = await insertOne(postTable, { title: input.title, body: input.body, authorId: actor.userId });

    await audit("post.created", post);

    return post;
  },
});
```

`audit(name, row, options?)` is auto-imported on the server.

- `name` is a dotted name, for example `"post.created"`.
- `row` is the row that the action changed. Its `id` becomes `targetId`, as a string.
- The first segment of the name becomes `targetType`: `"post.created"` gives `"post"`.

To set `targetType` yourself, or when you do not have the row, pass `{ type, id }` in place of the row:

```ts
await audit("post.force-deleted", { type: "posts", id });
```

A row that has a `type` column also sets `targetType`, so pass `{ type, id }` for such a row. Give the table name as `type` when the [`audit` option](#auditing-an-action) with a `target` also audits the same rows. It records the table name, so the two kinds of row then agree.

`audit()` reads the actor and the request ID from the current action and request. It throws when no actor is in scope, for example in a server route that does not call an action.

### Changes and metadata

```ts
await audit("post.updated", post, {
  changes: { title: { from: "Draft", to: "Published" } },
  metadata: { source: "admin-panel" },
});
```

`changes` and `metadata` are JSON objects. They go into the `changes` and `metadata` columns.

### The row

| Column | Value |
|---|---|
| `id` | A serial number, in insertion order. |
| `occurredAt` | The time of the write. |
| `actorType`, `actorId` | The actor in scope. A user is stored as a subject ID. See [People in the log](#people-in-the-log). |
| `action` | The name, the first argument of `audit()`. |
| `targetType`, `targetId` | From the target. A target of type `"user"` is stored as a subject ID. |
| `changes`, `metadata` | From the options, after redaction. |
| `requestId` | The ID of the current request, or `null`. |
| `prevHash`, `hash` | The hash chain. See [Tamper evidence](#tamper-evidence). |

## Auditing an action

```ts
// server/actions/posts/update-post.action.ts
import { eq } from "drizzle-orm";
import { postTable } from "#nuxvel/schema";

export const updatePostAction = defineAction({
  input: updatePostInput,
  audit: { name: "post.updated", target: postTable },
  handler: async (input) =>
    updateOne(postTable, input.id, { title: input.title }),
});
```

The `audit` option of `defineAction()` writes the audit row for you, in the transaction of the action, after the handler returns. A handler that throws writes no row.

- `audit: "post.created"` targets the row that the handler returns. Its `id` becomes `targetId`, and the first segment of the name becomes `targetType`. The handler must return a row with an `id`.
- `audit: { name, target }` targets the row of the `target` table with the ID `input.id`. It loads the row before and after the handler, and writes the columns that changed as `{ column: { from, to } }`. The `targetType` is the table name. If the row does not exist, the call fails as not found. The input must have an `id`.

`{ name, target }` compares values by content, so a date or JSON column that the handler did not change is not a change. It ignores `createdAt` and `updatedAt`, which change on each update, and `searchVector`, which Postgres builds from the other columns. See [Full-text search](./search.md). It also loads a trashed row, so it can audit a [soft delete](./soft-deletes.md) and a restore. Give each action its own name. The `changes` then hold the `deletedAt` column:

| Action | `changes` |
|---|---|
| `post.deleted` | `{ deletedAt: { from: null, to: "2026-09-25T10:00:00.000Z" } }` |
| `post.restored` | `{ deletedAt: { from: "2026-09-25T10:00:00.000Z", to: null } }` |

`{ name, target }` cannot audit a `forceDelete()`, because the row is gone after the handler. Call `audit("post.force-deleted", { type: "post", id })` in the handler instead.

## Redaction

`audit()` removes the keys `password`, `passwordHash`, `token` and `secret` from `changes` and `metadata` before it writes the row. These values never get into the audit log, even when a caller passes them. Redaction applies to the top-level keys of each object.

A column that you declare as `personal` with `defineUserData()` keeps its key in `changes`, but its value becomes `{ changed: true }`. See [Privacy: personal columns](./privacy.md#personal-columns).

## People in the log

```ts
await audit("user.promoted", user);
```

`audit()` never writes a user ID into `audit_log`. When the actor is a user, `actorId` holds a subject ID. When the target type is `"user"`, `targetId` holds a subject ID too. A subject ID is a random UUID. The first entry for a user creates it, and later entries use it again.

Two more tables, next to `audit_log` in `server/database/schema/audit-log.schema.ts`, hold the personal data:

| Table | Columns |
|---|---|
| `audit_subjects` | `id` is the subject ID. `userId` is the user ID. `displayName` is the name of the user when the subject was created. `mac` signs the row. |
| `audit_context` | `entryId` is the `id` of the entry. `ip` and `userAgent` come from the request. `mac` signs the row. |

`audit()` writes an `audit_context` row only for an entry that it writes during a request. The `ip` is the address of the client, as [`clientIp()`](./security.md#client-ip-behind-a-proxy) reads it.

Each row of these two tables has a `mac`. It is an HMAC-SHA256 of the row, keyed by `NUXT_AUDIT_CHAIN_SECRET`. The chain hash does not include the tables. When you erase a user with `eraseUserData()`, their subject row and the context rows of their entries are deleted, and the chain still verifies. A changed or added row fails `audit:verify`. See [Privacy](./privacy.md#the-audit-trail).

App code does not read these tables. See [Showing history in the app](#showing-history-in-the-app).

## Transactions

`audit()` writes inside `transaction()`, so it joins the transaction that is open. If the action rolls back, its audit row rolls back too. See [Database: transactions](./database.md#transactions).

To keep the chain in order, `audit()` takes a lock that it holds until its transaction commits. Transactions that write audit rows thus commit one at a time.

## Tamper evidence

```sh
nuxvel audit:verify
# ✔ Audit chain intact: 1204 rows verified

nuxvel audit:verify --json
# { "intact": true, "checked": 1204, "firstBreak": null }
```

Each row links to the row before it. It stores the `hash` of the previous row in `prevHash`. Its own `hash` is an HMAC-SHA256 of its content and `prevHash`, keyed by `NUXT_AUDIT_CHAIN_SECRET`. The secret is not in the database, so a database login or an SQL injection cannot compute a valid hash for a changed row. A trigger rejects every UPDATE and DELETE on `audit_log` and its partitions. Retention still drops expired partitions, and `eraseUserData()` deletes only `audit_subjects` and `audit_context`. If somebody edits or deletes a row, the chain breaks from that row on. Redaction runs before the hash, so redacted rows still verify.

`nuxvel audit:verify` reads the full log in order and reports the first break. It exits with code 1 when the chain is broken. The break has a reason:

| Reason | Meaning |
|---|---|
| `modified` | The content of the row does not match its hash. |
| `unlinked` | The row does not point at the row before it. A row between them was removed or changed. |
| `subject-modified` | The `audit_subjects` row with this ID does not match its `mac`. `firstBreak.id` is the subject ID. |
| `context-modified` | The `audit_context` row of this entry does not match its `mac`. `firstBreak.id` is the ID of the entry. |

`audit:verify` checks the subjects and the contexts after it checks the chain. The migration `audit-row-macs` adds the `mac` columns. Its [contract migration](./database.md#contract-migrations) makes Postgres refuse a row without a `mac`. A row that was written before it has no `mac`, and `audit:verify` does not check it. On a VPS, apply the contract migration with `nuxvel db:contract <env>` after the deploy.

An app that already exists adds `mac: text("mac")` to `auditSubjectsTable` and `auditContextTable` in `audit-log.schema.ts`, and runs `nuxvel db:generate`. Then it adds the contract file, `server/database/migrations/contract/<name>.sql`, with the name of the generated migration:

```sql
ALTER TABLE "audit_subjects" ADD CONSTRAINT "audit_subjects_mac_present" CHECK ("mac" IS NOT NULL) NOT VALID;
--> statement-breakpoint
ALTER TABLE "audit_context" ADD CONSTRAINT "audit_context_mac_present" CHECK ("mac" IS NOT NULL) NOT VALID;
```

```ts
const { checked, firstBreak } = await verifyAuditChain();

if (firstBreak) {
  console.error(`audit row ${firstBreak.id} was ${firstBreak.reason}`);
}
```

`verifyAuditChain()` does the same check from code. It is auto-imported on the server. `firstBreak` is `undefined` when the chain is intact. When `NUXT_DATABASE_OWNER_URL` is set to a different URL than `NUXT_DATABASE_URL`, it opens its own connection as the owner role, because the runtime role cannot read the log. That connection does not see the rows of a transaction that is not committed. On a VPS, [`nuxvel tinker <env>`](./deploy.md#logs-status-and-a-shell) has both URLs, so `await verifyAuditChain()` works there.

### The chain secret

`NUXT_AUDIT_CHAIN_SECRET` is required in production, at least 32 characters. `nuxvel app:create` writes a random one into `shared/.env` of a VPS when it has none. Elsewhere, make one with `openssl rand -hex 32`. Outside production, `NUXT_AUTH_SECRET` keys the chain when `NUXT_AUDIT_CHAIN_SECRET` is not set.

Never change it. Rows written under another value report `modified`, and `nuxvel key:rotate` refuses it. `nuxvel audit:verify` needs the same value as the server that wrote the rows. Keep a backup of it: `shared/.env` is part of the config bundle.

The secret protects against a stolen database login and against SQL injection. It does not protect against code that runs inside the app, which can read the secret. A stolen login of the runtime role, or an SQL injection, also cannot read the content of the rows. See [The database refuses the reads](#the-database-refuses-the-reads).

The chain proves only that the rows between the oldest row and the newest row are intact. If somebody deletes the newest rows, or the oldest rows, the shorter chain still verifies. To find this, copy the `hash` of the newest row to a place that the database cannot change. An external log or a signed export works. Compare the hash later. Deleting rows by hand needs the owner role, which can switch the trigger off.

## Partitions and retention

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  nuxvel: {
    audit: { retentionMonths: 24 },
  },
});
```

`audit_log` has one partition for each month, in UTC: `audit_log_y2026m09`, `audit_log_y2026m10`, and so on. The migration creates the partitions for the current month and the next three.

```sh
NUXT_DATABASE_OWNER_URL=... node .output/server/nuxvel/maintenance.mjs
# nuxvel maintenance: audit partitions created 1, dropped 0
#   created audit_log_y2027m01
```

The maintenance entry creates the partitions for the months that come next. Run it one time each day, for example from a systemd timer or a cron job. `nuxt build` adds it to `.output/server/nuxvel/`, next to the [migrate entry](./build.md#release-entries). Without a partition for the current month, `audit()` fails, and so does the action that calls it.

The entry connects as the owner role, with `NUXT_DATABASE_OWNER_URL`, or with `NUXT_DATABASE_URL` when the owner URL is not set. Creating and dropping a partition needs DDL rights. The runtime role of the server and the worker does not have them. When the work fails, the entry prints the error and exits with code 1.

### Partitions in development

```
◇  Audit log partitions: created 1, dropped 0
│    created audit_log_y2027m01
```

In development, the migration creates the partitions for the current month and the next three. `nuxvel db:fresh` creates them again from the current month.

These partitions end three months after the migration ran. On an older development database, `audit()` fails. Two commands do the work of the maintenance entry in development:

- `nuxvel db:migrate` creates the missing partitions after it applies the migrations. It connects as the owner role, like the migrations.
- `nuxvel dev` creates the missing partitions at startup, after the dev services are healthy. When the database has no `audit_log` table yet, it does nothing. When it cannot connect, it shows a warning and starts the dev server.

Both commands drop old partitions only when `nuxvel.audit.retentionMonths` is set. Without it, they only create partitions. Before they drop a partition, they export its rows, like the entry. See [Exported partitions](#exported-partitions).

### Retention

Set `retentionMonths` to drop old months with the same entry. The build writes the value into the entry, so build again after you change it:

- `retentionMonths` includes the current month. `24` keeps this month and the 23 months before it.
- It must be a whole number of at least 1. Other values throw.
- Without `retentionMonths`, nuxvel never drops a partition.
- Before it drops a partition, the entry exports its rows. See [Exported partitions](#exported-partitions).
- A dropped partition deletes its rows from the database. The hash chain then starts at the oldest row that is left.

### Exported partitions

```sh
aws s3 cp s3://my-app/backups/audit/audit_log_y2024m09.jsonl.gz - | gunzip | head -1
# {"id":1204,"occurred_at":"2024-09-15T10:00:00","actor_type":"user",...}
```

Before it drops a partition, the maintenance entry writes all rows of the partition to storage. The object key is `backups/audit/<partition>.jsonl.gz` in the bucket of `NUXT_STORAGE_BUCKET`. The file holds one JSON object for each row, in `id` order, with the column names of the table, compressed with gzip.

The entry reads `NUXT_STORAGE_URL` and `NUXT_STORAGE_BUCKET`, like the server. See [Storage](./storage.md#configuration). If the upload fails, or a variable is not set, the entry exits with code 1 and drops nothing. The partition then stays until the next run succeeds.

```ts
const { created, dropped } = await maintainAuditPartitions({ retentionMonths: 24 });
```

`maintainAuditPartitions()` does the same work on demand. It is auto-imported on the server. It needs DDL rights, so call it only from code that connects as the owner role, such as a test.

| Option | Default |
|---|---|
| `now` | The current date. The months count from this date. |
| `retentionMonths` | `nuxvel.audit.retentionMonths` from `nuxt.config.ts`. |

Do not call it inside a transaction. It detaches a partition concurrently before it drops it, so audit writes do not wait.

## Showing history in the app

The audit log is for compliance only. App features must not read the `audit_log` table or the other audit tables. Use the CLI commands in [Reading the log](#reading-the-log) to read it. [`nuxvel test:arch`](./cli.md#nuxvel-testarch) refuses app server code that reads the audit tables, with the rule `nuxvel/no-audit-reads`.

A feature that shows history, for example an activity timeline on a ticket, keeps its own table. The action that changes the row also writes the history row, in the same transaction. A tRPC procedure reads the history table, and its policy controls who sees it. The action can also call `audit()` when the change matters for compliance. The two tables then hold the same event for different readers.

### The database refuses the reads

The lint rule finds only reads that it can see in the source. For example, it does not find a table name that the code builds at runtime. Thus in a deployed app, Postgres also refuses the reads. The runtime role of the server and the worker can write audit rows, but it cannot read them:

| Table | What the runtime role can do |
|---|---|
| `audit_log` | Insert rows. Read only `id`, `hash` and `actorId`. |
| A partition of `audit_log`, for example `audit_log_y2026m09` | Nothing. |
| `audit_subjects` | Insert and delete rows. Read only `id` and `userId`. |
| `audit_context` | Insert and delete rows. Read only `entryId`. |

`audit()` needs `hash` to chain a new row to the row before it. `eraseUserData()` needs `actorId`, `id`, `userId` and `entryId` to find the rows of the user. Any other read, for example `select changes from audit_log` or `select * from audit_log_y2026m09`, fails with the Postgres error `permission denied`.

The [migrate entry](./build.md#release-entries) applies these rights after the migrations, as the owner role. The [maintenance entry](#partitions-and-retention), `nuxvel db:migrate` and `nuxvel dev` apply them again after they create partitions. A new partition gets the rights of the default privileges, which allow all reads, so it needs this step. The step applies the rights to the role of `NUXT_DATABASE_URL` and to each role that it gets rights from, such as `<app>_app` after [`nuxvel key:rotate`](./deploy.md#rotating-credentials). It does nothing when `NUXT_DATABASE_URL` and the owner connection use the same role. That is the case in development and in tests, where one role does all the work.

## Reading the log

```sh
nuxvel audit:tail
nuxvel audit:export --from 2026-09-01 --to 2026-10-01 --format csv
```

| Command | What it does |
|---|---|
| `audit:tail` | Prints each new row as it is written, until you stop it with Ctrl-C. |
| `audit:export` | Prints the rows in a time range, as CSV or JSON lines. |

These commands, and `nuxvel audit:verify`, read the log as the owner role when `NUXT_DATABASE_OWNER_URL` is set to a different URL than `NUXT_DATABASE_URL`. The runtime role cannot read the log. See [The database refuses the reads](#the-database-refuses-the-reads).

`audit:export` takes these options:

- `--from` is the earliest `occurredAt` to include.
- `--to` is the `occurredAt` to stop before. It is not included.
- `--format` is `csv` or `jsonl`. The default is `jsonl`.

In CSV, a cell that starts with `=`, `+`, `-`, `@`, a tab or a carriage return gets a `'` in front, so a spreadsheet does not run it as a formula.

A date without a timezone is in UTC. See [CLI](./cli.md).

## Testing

```ts
import { actingAs, describe, expect, expectAudited, it } from "@nuxvel/nuxt/testing";
import { postFactory, userFactory } from "#nuxvel/factories";

describe("update post", () => {
  it("logs the change", async () => {
    const author = await userFactory();
    const post = await postFactory({ authorId: author.id, title: "Draft", body: "Hello" });
    const { api } = actingAs(author);

    await api.post.update({ id: post.id, title: "Updated", body: "Hello" });

    const row = await expectAudited("post.updated", {
      actorId: author.id,
      targetId: String(post.id),
    });

    expect(row.changes).toEqual({ title: { from: "Draft", to: "Updated" } });
  });
});
```

`expectAudited(action, match?)` from `@nuxvel/nuxt/testing` asserts that an `audit_log` row exists for the action. The row must also match the columns in `match`, which are typed from the table. It returns the row. Give a user ID as `actorId` or `targetId`. `expectAudited()` then matches the subject ID of that user. It reads the `audit_log` table of `server/database/schema/`. `expectNotAudited(action, match?)` asserts the opposite: no such row exists. See [Testing](./testing.md).

## See also

- [Actions](./actions.md)
- [API (tRPC)](./api.md)
- [Database](./database.md)
- [Queues](./queues.md)
- [CLI](./cli.md)
- [Testing](./testing.md)
