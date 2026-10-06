# Privacy

## Introduction

nuxvel can export or erase all of the personal data of one user. You declare which tables hold user data, and which column holds the user's ID. `nuxvel user:export` and `nuxvel user:erase` then act on every declared table. Use them when a user asks for a copy of their data, or asks you to delete it.

## Declaring user data

```ts
// server/privacy/posts.user-data.ts
import { postTable } from "#nuxvel/schema";

export const postsUserData = defineUserData(postTable, postTable.authorId);
```

```ts
// server/privacy/users.user-data.ts
import { userTable } from "#nuxvel/schema";

export const usersUserData = defineUserData(userTable, userTable.id);
```

Put one declaration in each file under `server/privacy/`. Export it as a named export whose name ends with `UserData`. A default export also works. Each declaration names a table and the column that holds the user's ID. `defineUserData` is auto-imported. nuxvel finds the files, so you do not register them.

The column must be a string column of the table that you pass. A column of another table, or a column that is not a string, fails `nuxt typecheck`.

[`nuxvel test:arch`](./cli.md#nuxvel-testarch) reports a table with a column that references the user table, such as `userId`, `ownerId` or `authorId`, and has no declaration. The message names the column. A column counts when its `.references()` callback returns `userTable.id`.

[`nuxvel make:router --crud`](./cli.md#nuxvel-makerouter-name---crud) and [`nuxvel make:resource`](./cli.md#nuxvel-makeresource-name) write this file for the table that they create, with `ownerId` as the column: `server/privacy/<name>.user-data.ts`. Export and erasure then include the rows of the owner, and `nuxvel test:arch` passes. Run the command with `--force` to write the file again.

### Tables with more than one user column

```ts
// server/privacy/posts.user-data.ts
import { postTable } from "#nuxvel/schema";

export const postsUserData = defineUserData(postTable, postTable.authorId);
```

```ts
// server/privacy/post-editors.user-data.ts
import { postTable } from "#nuxvel/schema";

export const postEditorsUserData = defineUserData(postTable, postTable.editorId);
```

A table can have two user columns, such as the author and the editor of a post. Declare each column in its own file. nuxvel merges the declarations. A row that matches any of the columns belongs to the user. The export lists that row one time, and the erasure deletes it one time.

### Personal columns

```ts
// server/privacy/users.user-data.ts
import { userTable } from "#nuxvel/schema";

export const usersUserData = defineUserData(userTable, userTable.id, { personal: [userTable.name, userTable.email] });
```

List the columns that hold personal values in `personal`. Each column must belong to the declared table. The audit log then never holds their values. When an audit entry records a change to one of these columns, it stores `{ changed: true }` instead of the old and new values:

```ts
await audit("user.updated", { type: "user", id: user.id }, {
  changes: { email: { from: "ada@example.com", to: "ada@example.org" } },
});
// changes: { email: { changed: true } }
```

This applies when the `type` of the target is the name of the declared table, as with [`audited()`](./audit.md#auditing-a-mutation). A `create-nuxvel` app marks `name` and `email` of the `user` table as personal.

## Framework tables

```ts
// server/privacy/flag-exposures.user-data.ts
import { flagExposuresTable } from "#nuxvel/schema";

export const flagExposuresUserData = defineUserData(flagExposuresTable, flagExposuresTable.unitId);
```

Some tables that nuxvel creates also hold user data. A `create-nuxvel` app declares them in `server/privacy/` already. In an existing app, declare the ones that you have:

| Table | Declaration |
|---|---|
| `user` | `defineUserData(userTable, userTable.id)` |
| `flag_exposures` | `defineUserData(flagExposuresTable, flagExposuresTable.unitId)` |
| `flag_conversions` | `defineUserData(flagConversionsTable, flagConversionsTable.unitId)` |
| `notifications` | `defineUserData(notificationsTable, notificationsTable.userId)` |
| `api_keys` | `defineUserData(apiKeysTable, apiKeysTable.userId)` |
| `push_subscriptions` | `defineUserData(pushSubscriptionsTable, pushSubscriptionsTable.userId)` |

`api_keys` holds the [API keys](./openapi.md#api-keys) of a user, as hashes. The export shows the name, the dates and the hash of each key, never the key.

The flag tables hold the subject that a flag was evaluated for. This is the ID of the signed-in user, unless you pass a different subject. The `notifications` table holds the [notifications](./notifications.md) that a user got. `push_subscriptions` holds the push endpoints of the devices of a user. See [Progressive web app](./pwa.md#the-subscriptions-table).

Do not declare these tables:

- `session`, `account` and `two_factor`. They hold credentials, such as session tokens, password hashes and TOTP secrets. Their rows cascade when the `user` row is deleted.
- `mail_suppressions`. Its key is an email address, not a user ID, so you cannot declare it.
- The billing tables of [`nuxvel.billing`](./billing.md#erasing-a-user). The law keeps payment records for accounting, so an erasure keeps them.

## Exporting a user's data

```sh
nuxvel user:export 3f1c...
```

The command prints JSON with one key for each declared table:

```json
{
  "post": [{ "id": 12, "title": "Hello", "authorId": "3f1c..." }],
  "user": [{ "id": "3f1c...", "name": "Ada", "email": "ada@example.com" }]
}
```

A declared table with no rows for the user is in the output as an empty list. A table that you declared more than one time is in the output one time.

```ts
const archive = await exportUserData(user.id);
```

`exportUserData(userId)` returns the same object from server code. It is auto-imported on the server.

## Erasing a user's data

```sh
nuxvel user:erase 3f1c...
# ✔ Erased user 3f1c...: post 2, user 1
```

```ts
const erased = await eraseUserData(user.id);
// { post: 2, user: 1 }
```

`eraseUserData(userId)` deletes every declared row in one transaction. It returns the number of rows that each table lost. It is auto-imported on the server, and `nuxvel user:erase` runs it.

`nuxvel user:erase` asks for confirmation in a terminal. In a script, pass `--force`: without it, the command erases nothing and exits with an error.

The erasure deletes each row permanently. A row that was [soft-deleted](./soft-deletes.md) is deleted too, because a trashed row still holds the user's data. For the same reason, the export includes trashed rows.

`eraseUserData()` erases the tables in the sort order of their files in `server/privacy/`. Name the files so that a child table comes before the table that it references. You can also let the foreign key cascade.

`eraseUserData()` throws when the app declares no user data. It does not report an erasure that erased nothing.

With [billing](./billing.md#erasing-a-user) on, `eraseUserData()` first cancels the user's active Stripe subscriptions, so Stripe charges them no more. When Stripe refuses, it throws and erases nothing.

### The erasure log

A backup taken before an erasure still holds the user's rows. So that a restore does not bring them back, record each erasure outside the database: set `NUXT_ERASURE_LOG_COMMAND` to a command, and `eraseUserData()` runs it with the user's ID as its last argument before it erases anything. The command is split on spaces and runs without a shell. When it fails, `eraseUserData()` throws and erases nothing.

```bash
NUXT_ERASURE_LOG_COMMAND="/usr/local/bin/record-erasure tasks"
# eraseUserData("u_123") first runs: /usr/local/bin/record-erasure tasks u_123
```

On a VPS, `nuxvel deploy` sets it for you. See [Deploying to a VPS](./deploy.md#erasures-and-restores).

### The audit trail

The erasure never deletes audit rows. It writes one `user.erased` audit row, with the number of rows that each table lost in its metadata. The actor is the actor in scope. With no actor in scope, such as in `nuxvel user:erase`, the actor is `systemActor("user-data")`. See [Audit log](./audit.md).

After it writes `user.erased`, the erasure deletes the `audit_subjects` row of the user. It also deletes the `audit_context` rows of the entries that the user wrote. This includes the entries written with one of the API keys of the user. The audit rows stay, but no row names the user any more. The hash chain does not include these tables, and a deleted row is not a change that `nuxvel audit:verify` reports, so it still passes. See [People in the log](./audit.md#people-in-the-log).

## Testing

```ts
// server/actions/account/erase-account.action.ts
import { z } from "zod";

export const eraseAccountAction = defineAction({
  input: z.object({}),
  handler: async (_input, ctx) => eraseUserData(ctx.actor.id),
});
```

```ts
import { expect, expectAudited, runAction } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { postFactory, userFactory } from "#nuxvel/factories";

describe("account.erase-account", () => {
  it("erases the author and their posts", async () => {
    const author = await userFactory();
    await postFactory.for("authorId", author)();

    const erased = await runAction("account.erase-account", {}, { actingAs: author });

    expect(erased.post).toBe(1);
    expect(erased.user).toBe(1);
    await expectAudited("user.erased", { targetId: author.id });
  });
});
```

`eraseUserData()` joins the transaction of the action. The audit row names the user who ran the action as its actor. See [Testing](./testing.md).

## See also

- [CLI](./cli.md#nuxvel-userexport-id)
- [Audit log](./audit.md)
- [Feature flags](./flags.md)
- [Notifications](./notifications.md)
- [Database](./database.md)
