# Tutorial: a live team chat

## Introduction

This tutorial builds a team chat, one feature per chapter. Users sign up and create rooms. The owner of a room adds members by email. Only the members of a room can read it and post to it. A new message shows in every open copy of the room without a reload. The room shows who is in it now and who is typing. A message that you send shows at once, before the server answers.

The chapters use each realtime feature of nuxvel:

- a channel that authorizes each connection, and a room for each chat room
- presence: who is in a room, and a typing flag for each member
- a broadcast to one room from an action, after the commit
- `useLiveQuery()` and `useChannel()` in a page
- an optimistic update of the message list
- `<PresenceAvatars>` and `<TypingIndicator>` from the nuxvel UI
- the replay of missed events after a reconnect

Each chapter also adds tests, in the layer that owns the check. A functional test checks the server: a broadcast, a refused channel, a member of a room. A component test is a Storybook story with a `play` function. An end-to-end test opens the app in two browsers, as two users. See [Testing](../testing.md#introduction) for the three layers.

This tutorial expects that you know the basics of nuxvel. If you do not, do the [first app tutorial](./first-app.md) first. You need Node.js 24 and Docker. Run every command from the app folder, unless a chapter says otherwise.

## 1. Create the app

```bash
npm create nuxvel@latest team-chat
cd team-chat
npm install
```

See [Starting a new app](../create.md) for what the command writes.

Start the dev services from `docker-compose.yml`, then run the functional tests. The services stay running for the commands of this tutorial. `./nv services down` stops them when you are done:

```bash
./nv services up
npm run test:functional
```

```
◇ Dev services are already healthy (docker compose)
◇ Built the app for tests: no earlier build (20.0s)

 Test Files  2 passed (2)
      Tests  5 passed (5)
```

Give the app its name in `nuxt.config.ts`. The title template of each page and the installable app use it:

```ts
// nuxt.config.ts
    seo: { siteName: 'Team Chat', defaultDescription: 'Rooms where a team talks live.', ogImage: true },
    pwa: {
      name: 'Team Chat',
```

## 2. Rooms and messages

A room has a name and an owner. A member is one user in one room. A message has a body, a room and an author. Generate the room as a full resource, with its pages. Then generate the two other tables:

```bash
./nv make:resource room name --ui --no-openapi
./nv make:schema room-member room:references user:references=user
./nv make:schema message body:text room:references author:references=user
```

```
✔ Created server/database/schema/room.schema.ts
✔ Created shared/schemas/room.ts
✔ Created server/policies/room.policy.ts
✔ Created server/actions/room/create-room.action.ts
✔ Created server/actions/room/update-room.action.ts
✔ Created server/actions/room/delete-room.action.ts
✔ Created server/trpc/routers/room.router.ts
✔ Created server/trpc/routers/room.router.test.ts
✔ Created app/pages/room/index.vue
✔ Created app/pages/room/new.vue
✔ Created app/components/RoomForm.vue
◇ Updated types (nuxt prepare) (10.0s)
✔ Created server/database/schema/room-member.schema.ts
✔ Created shared/schemas/room-member.ts
◇ Updated types (nuxt prepare) (10.9s)
✔ Created server/database/schema/message.schema.ts
✔ Created shared/schemas/message.ts
◇ Updated types (nuxt prepare) (10.7s)
```

`make:resource` adds an `ownerId` column to the room. The create action sets it from the signed-in user. `user:references=user` is a foreign key to the `user` table, so `room-member` gets a `userId` column and `message` gets an `authorId` column. See [CLI: fields](../cli.md#fields).

A user is a member of a room one time only. Replace the index on `room_id` with a unique index on the room and the user. The unique index starts with `room_id`, so it also serves the foreign key:

```ts
// server/database/schema/room-member.schema.ts
import { index, integer, pgTable, serial, text, uniqueIndex } from "drizzle-orm/pg-core";
import { timestamps } from "@nuxvel/nuxt/database";
import { roomTable } from "./room.schema";
import { userTable } from "./auth.schema";

export const roomMemberTable = pgTable("room_member", {
  id: serial("id").primaryKey(),
  roomId: integer("room_id").notNull().references(() => roomTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => userTable.id, { onDelete: "cascade" }),
  ...timestamps(),
}, (table) => [uniqueIndex("room_member_room_id_user_id_idx").on(table.roomId, table.userId), index("room_member_user_id_idx").on(table.userId)]);

export type RoomMemberRow = typeof roomMemberTable.$inferSelect;
export type NewRoomMemberRow = typeof roomMemberTable.$inferInsert;
```

No form edits a member row, so the app does not need its Zod schemas. Delete the file:

```bash
rm shared/schemas/room-member.ts
```

Write the migration, apply it and check it:

```bash
./nv db:generate --name rooms-and-messages
./nv db:migrate
./nv db:check
```

```
✔ Every foreign key has an index
✔ Every migration is in order
✔ Every migration is safe to deploy
```

### User data

`nuxvel user:export` and `nuxvel user:erase` act on each table that a `defineUserData()` declares. Declare the three tables that hold a user ID:

```ts
// server/privacy/rooms.user-data.ts
import { roomTable } from "#nuxvel/schema";

export const roomsUserData = defineUserData(roomTable, roomTable.ownerId);
```

```ts
// server/privacy/room-members.user-data.ts
import { roomMemberTable } from "#nuxvel/schema";

export const roomMembersUserData = defineUserData(roomMemberTable, roomMemberTable.userId);
```

```ts
// server/privacy/messages.user-data.ts
import { messageTable } from "#nuxvel/schema";

export const messagesUserData = defineUserData(messageTable, messageTable.authorId);
```

`./nv test:arch` reports each column that references the user table and has no declaration, such as `ownerId`, `userId` and `authorId`. The erasure of an owner deletes the owner's rooms. The foreign keys then delete the members and the messages of those rooms. See [Privacy](../privacy.md).

### Factories

```bash
./nv make:factory room
./nv make:factory room-member
./nv make:factory message
```

Each command writes a factory and a test that inserts two rows. The generator selects a value from the column name only, so a room name gets a person's name. Give the rooms and the messages better values:

```ts
// server/factories/room.factory.ts
import { faker } from "@faker-js/faker";
import { userFactory } from "./users.factory";
import { defineFactory } from "@nuxvel/nuxt/factories";
import { roomTable } from "#nuxvel/schema";

export const roomFactory = defineFactory(roomTable, {
  ownerId: async () => (await userFactory()).id,
  name: () => `${faker.word.adjective()} ${faker.word.noun()}`,
});
```

```ts
// server/factories/message.factory.ts
import { faker } from "@faker-js/faker";
import { roomFactory } from "./room.factory";
import { userFactory } from "./users.factory";
import { defineFactory } from "@nuxvel/nuxt/factories";
import { messageTable } from "#nuxvel/schema";

export const messageFactory = defineFactory(messageTable, {
  body: () => faker.lorem.sentence(),
  roomId: async () => (await roomFactory()).id,
  authorId: async () => (await userFactory()).id,
});
```

### Seeding a room

You need two users to see a realtime feature. Replace the seeder. It creates three users with one password, and a `General` room with one message from each user:

```ts
// server/seeders/database.seeder.ts
import { messageFactory, roomMemberFactory, roomFactory, userFactory } from "#nuxvel/factories";

const PASSWORD = "demo-password";

export const databaseSeeder = defineSeeder(async () => {
  const withPassword = userFactory.withPassword(PASSWORD);
  const demo = await withPassword({ name: "Demo User", email: "demo@example.com", emailVerified: true });
  const ada = await withPassword({ name: "Ada Lovelace", email: "ada@example.com", emailVerified: true });
  const grace = await withPassword({ name: "Grace Hopper", email: "grace@example.com", emailVerified: true });

  const general = await roomFactory({ name: "General", ownerId: demo.id });
  for (const user of [demo, ada, grace]) {
    await roomMemberFactory({ roomId: general.id, userId: user.id });
    await messageFactory({ roomId: general.id, authorId: user.id });
  }

  return [`Sign in as demo@example.com, ada@example.com or grace@example.com with the password ${PASSWORD}`];
});
```

```bash
./nv db:fresh --seed --force
```

```
Sign in as demo@example.com, ada@example.com or grace@example.com with the password demo-password
✔ Seeded database
```

Replace the starter's seeder test, so that it checks the room:

```ts
// tests/functional/seeders.test.ts
import { expectCount, expectRow, runSeeder, signIn } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { userTable, messageTable, roomMemberTable, roomTable } from "#nuxvel/schema";

describe("the database seeder", () => {
  it("creates a General room with three members, who sign in with the printed password", async () => {
    await runSeeder("database");

    const demo = await expectRow(userTable, { email: "demo@example.com", name: "Demo User" });
    const general = await expectRow(roomTable, { name: "General", ownerId: demo.id });
    await expectCount(roomMemberTable, 3, { roomId: general.id });
    await expectCount(messageTable, 3, { roomId: general.id });

    await signIn("demo@example.com", "demo-password");
    await signIn("grace@example.com", "demo-password");
  });
});
```

Run `npm run test:functional`. See [Database](../database.md) and [Testing: factories](../testing.md#factories).

## 3. Who may read a room

Only the members of a room may read it and post to it. Only its owner may add a member. The owner is a member too, from the moment the room exists.

### The policy

The generated policy lets the owner update and delete a room. Add the rules for the members:

```ts
// server/policies/room.policy.ts
import { and, eq } from "drizzle-orm";
import { roomMemberTable, roomTable } from "#nuxvel/schema";

const isMember = async (userId: string, roomId: number) =>
  (
    await useDb()
      .select({ id: roomMemberTable.id })
      .from(roomMemberTable)
      .where(and(eq(roomMemberTable.roomId, roomId), eq(roomMemberTable.userId, userId)))
  ).length > 0;

export const roomPolicy = definePolicy(roomTable, {
  view: (actor, row) => isMember(actor.id, row.id),
  post: (actor, row) => isMember(actor.id, row.id),
  addMember: (actor, row) => row.ownerId === actor.id,
  update: (actor, row) => row.ownerId === actor.id || actor.role === "admin",
  delete: (actor, row) => row.ownerId === actor.id || actor.role === "admin",
});
```

The channel in chapter 4 and the message router in chapter 5 call `view`. The post action calls `post`. See [Authorization](../authorization.md).

### The owner is a member

The create action must also add the owner to the room. Add the insert to the generated action. It runs in the transaction of the action. If the insert fails, the database keeps no room:

```ts
// server/actions/room/create-room.action.ts
import { roomMemberTable, roomTable } from "#nuxvel/schema";

export const createRoomAction = defineAction({
  input: createRoomInput,
  handler: async (input, ctx) => {
    const row = await insertOne(roomTable, { ...input, ownerId: ctx.actor.id });

    await useDb().insert(roomMemberTable).values({ roomId: row.id, userId: ctx.actor.id });
    await audit("room.created", row);

    return row;
  },
});
```

### Adding a member

```bash
./nv make:action room/add-member room_id:integer email:email
```

The form in the browser checks the same input, and code in `app/` cannot import a server file. So the input goes to `shared/schemas/room.ts`. Add it at the end of the file, and give the room name a message:

```ts
// shared/schemas/room.ts
  name: z.string().trim().min(1, "Give the room a name").max(255),
```

```ts
// shared/schemas/room.ts
export const addMemberInput = z.object({
  roomId: z.number().int().positive(),
  email: z.email().max(255),
});
```

Then write the handler. `addMemberInput` is auto-imported, as every export of `shared/schemas/` is:

```ts
// server/actions/room/add-member.action.ts
import { eq } from "drizzle-orm";
import { userTable, roomMemberTable, roomTable } from "#nuxvel/schema";

export const addMemberAction = defineAction({
  input: addMemberInput,
  errors: {
    "room.member-unknown": { message: "Nobody with this email has signed up", field: "email" },
  },
  handler: async (input, ctx, fail) => {
    const room = await findAuthorized(roomTable, input.roomId, "addMember");

    const [user] = await useDb().select().from(userTable).where(eq(userTable.email, input.email));
    if (!user) return fail("room.member-unknown");

    await useDb().insert(roomMemberTable).values({ roomId: room.id, userId: user.id }).onConflictDoNothing();

    return { roomId: room.id, userId: user.id };
  },
});
```

`onConflictDoNothing()` uses the unique index from chapter 2. A second add of the same user changes nothing and does not fail.

### The room router

The generated `list` and `byId` return the rooms that the user owns. In a chat, a user sees the rooms where the user is a member. Replace the owner condition with `joinedBy()`, and add the `addMember` mutation:

```ts
// server/trpc/routers/room.router.ts
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { createRoomAction } from "#server/actions/room/create-room.action";
import { updateRoomAction } from "#server/actions/room/update-room.action";
import { deleteRoomAction } from "#server/actions/room/delete-room.action";
import { roomMemberTable, roomTable } from "#nuxvel/schema";

const joinedBy = (userId: string) =>
  inArray(
    roomTable.id,
    useDb().select({ id: roomMemberTable.roomId }).from(roomMemberTable).where(eq(roomMemberTable.userId, userId)),
  );

export const roomRouter = {
  list: authedProcedure
    .input(roomListInput)
    .output(paginated(roomSchema))
    .query(({ input, ctx }) =>
      paginate(
        useDb()
          .select()
          .from(roomTable)
          .where(and(joinedBy(ctx.user.id), listWhere(roomTable, input.filters)))
          .orderBy(...listOrderBy(roomTable, input.sort), desc(roomTable.id))
          .$dynamic(),
        input,
      ),
    ),
  byId: authedProcedure
    .input(roomIdInput)
    .output(roomSchema)
    .query(({ input, ctx }) =>
      useDb()
        .select()
        .from(roomTable)
        .where(and(eq(roomTable.id, input.id), joinedBy(ctx.user.id)))
        .then(firstOrFail),
    ),
  create: authedProcedure
    .input(createRoomInput)
    .output(roomSchema)
    .mutation(async ({ input }) => {
      const row = await createRoomAction(input);
      flash("Room created");
      return row;
    }),
  update: authedProcedure
    .input(updateRoomInput)
    .output(roomSchema)
    .mutation(async ({ input }) => {
      const row = await updateRoomAction(input);
      flash("Room saved");
      return row;
    }),
  delete: authedProcedure
    .input(roomIdInput)
    .output(roomIdInput)
    .mutation(async ({ input }) => {
      const row = await deleteRoomAction(input);
      flash("Room deleted");
      return row;
    }),
  addMember: authedProcedure
    .output(z.object({ roomId: z.number(), userId: z.string() }))
    .action($actions.room.addMember),
};
```

A room where the user is not a member gives `NOT_FOUND` from `byId`. The database filters the rows, so the router does not load a room that the user may not see.

The list page must link to the room page of chapter 6. In `app/pages/room/index.vue`, add a slot for the `name` column before the `#actions-cell` slot:

```vue
<!-- app/pages/room/index.vue -->
      <template #name-cell="{ row }">
        <ULink :to="{ name: 'room-id', params: { id: row.original.id } }" class="font-medium">{{ row.original.name }}</ULink>
      </template>
```

### Test the rules

The generated action test calls the action with sample values. Room `1` does not exist, so the test fails now. Replace it:

```ts
// server/actions/room/add-member.action.test.ts
import { actingAs, expect, runAction } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { roomFactory, userFactory } from "#nuxvel/factories";

describe("room/add-member action", () => {
  it("lets the owner add a user by email, who then sees the room", async () => {
    const ada = await userFactory();
    const grace = await userFactory();
    const room = await roomFactory({ ownerId: ada.id });

    await runAction("room.add-member", { roomId: room.id, email: grace.email }, { actingAs: ada });

    expect(await actingAs(grace).trpc.room.byId({ id: room.id })).toMatchObject({ name: room.name });
  });

  it("fails with a typed code for an unknown email", async () => {
    const ada = await userFactory();
    const room = await roomFactory({ ownerId: ada.id });

    await expect(
      runAction("room.add-member", { roomId: room.id, email: "nobody@example.com" }, { actingAs: ada }),
    ).rejects.toBeActionError("room.member-unknown");
  });

  it("refuses a user who does not own the room", async () => {
    const grace = await userFactory();
    const room = await roomFactory();

    await expect(
      runAction("room.add-member", { roomId: room.id, email: grace.email }, { actingAs: grace }),
    ).rejects.toBeTrpcError("FORBIDDEN");
  });
});
```

The first test reads the room through the router as the new member. So it checks the action, the `joinedBy()` condition and the policy together. The generated `room.router.test.ts` still passes: it creates its rooms through `trpc.room.create`, and the create action adds the owner as a member.

Run `npm run test:functional`.

## 4. The room channel

A channel carries server events to the browser. Generate it:

```bash
./nv make:channel room
```

```
✔ Created server/channels/room.channel.ts
✔ Created server/channels/room.channel.test.ts
```

The generated channel lets every signed-in user listen, and carries one event, `updated`. Replace it:

```ts
// server/channels/room.channel.ts
import { eq } from "drizzle-orm";
import { z } from "zod";
import { roomTable } from "#nuxvel/schema";

export const roomChannel = defineChannel({
  events: {
    posted: z.object({ id: z.number() }),
  },
  params: ["roomId"],
  authorize: async ({ user, params }) => {
    if (user === null || !/^\d{1,9}$/.test(params.roomId ?? "")) return false;

    const [room] = await useDb().select().from(roomTable).where(eq(roomTable.id, Number(params.roomId)));

    return room !== undefined && (await can("view", roomTable, room));
  },
  presence: { state: z.object({ typing: z.boolean() }) },
});
```

The channel has one room for each chat room. `params: ["roomId"]` names the param of a room. The room of chat room 7 is `room?roomId=7`. A broadcast to a room goes only to the listeners of that room.

- `authorize` runs for each room, and gets the params as strings. It refuses a value that is not a short number, so `abc` or `99999999999` never reaches the database. Then it calls the `view` rule of the policy, so only a member of the chat room listens. `can()` checks the signed-in user of the connection.
- `authorize` also refuses `room` with no room ID, because its `params` is `{}`. A guest gets `403`.
- The `posted` event holds only the ID of the new message. The page fetches the messages again, through a router that checks the membership, so the event needs no more data.

`presence: { state }` turns presence on and gives each member a state. Here the state is a `typing` flag. Each member starts with the state `{}`. A signed-in listener of a room is also a member of the room.

`authorize` runs when a connection opens, at each reconnect, and again at each `ping`, every 15 seconds. A user who loses access to a room leaves it one ping later at the latest. See [Realtime: broadcasting to a room](../realtime.md#broadcasting-to-a-room), [Realtime: authorizing a connection](../realtime.md#authorizing-a-connection) and [Realtime: rooms](../realtime.md#rooms).

### Test the channel

`client.listen()` opens a channel stream as a user, the same stream that the browser opens. It resolves with the channels that the app accepted and refused. Replace the generated test:

```ts
// server/channels/room.channel.test.ts
import { actingAs, expect, expectPresent, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { roomMemberFactory, roomFactory, userFactory } from "#nuxvel/factories";

describe("room channel", () => {
  it("refuses a guest", async () => {
    await expect(guest().listen("room")).rejects.toBeTrpcError("FORBIDDEN");
  });

  it("lets a user join only the rooms they are a member of", async () => {
    const ada = await userFactory();
    const own = await roomFactory();
    const other = await roomFactory();
    await roomMemberFactory({ roomId: own.id, userId: ada.id });
    const rooms = [`room?roomId=${own.id}`, `room?roomId=${other.id}`, "room?roomId=abc", "room"];

    const stream = await actingAs(ada).listen(rooms);

    expect(stream).toMatchObject({ channels: [rooms[0]], refused: [rooms[1], rooms[2], rooms[3]] });
  });

  it("makes a listener a member of the room", async () => {
    const ada = await userFactory();
    const room = await roomFactory();
    await roomMemberFactory({ roomId: room.id, userId: ada.id });

    await actingAs(ada).listen(`room?roomId=${room.id}`);

    const member = await expectPresent("room", { roomId: room.id }, ada);
    expect(member).toMatchObject({ name: ada.name, state: {}, connections: 1 });
  });
});
```

- The first test is the generated one. A refused channel rejects `listen()` with `FORBIDDEN`.
- The second test opens one stream for four channel names. The `connected` event lists the room of the member in `channels`. It lists the room of another chat room, the room with a bad ID and `room` with no ID in `refused`. The connection stays open for the accepted room.
- The third test opens a room. `expectPresent()` reads the members of the room, as `presenceOf()` does in the app, and returns the member. `connections` counts the open tabs of the user in the room.

Run `npm run test:functional`. `./nv channels` lists the channel, and shows that a guest is refused:

```
NAME         GUESTS   REPLAY BUFFER  SERVERS LISTENING
flags        allowed  0 of 500       0
maintenance  allowed  0 of 500       0
room         refused  0 of 500       0
```

## 5. Posting a message

The message input and the output of the message list are shared with the browser. Replace the generated file. The input has no `authorId`, because the action sets it from the signed-in user. The output adds the name of the author:

```ts
// shared/schemas/message.ts
import { z } from "zod";

export const postMessageInput = z.object({
  roomId: z.number().int().positive(),
  body: z.string().trim().min(1, "Write a message").max(2000),
});

export const messageSchema = z.object({
  id: z.number(),
  body: z.string(),
  roomId: z.number(),
  authorId: z.string(),
  authorName: z.string(),
  createdAt: z.date(),
});
```

### The action

```bash
./nv make:action message/post-message room_id:integer body:text
```

```ts
// server/actions/message/post-message.action.ts
import { messageTable, roomTable } from "#nuxvel/schema";

export const postMessageAction = defineAction({
  input: postMessageInput,
  handler: async (input, ctx) => {
    const room = await findAuthorized(roomTable, input.roomId, "post");

    const row = await insertOne(messageTable, { ...input, authorId: ctx.actor.id });

    await $channels.room.broadcast("posted", { id: row.id }, { roomId: room.id });

    return row;
  },
});
```

`$channels.room.broadcast()` waits for the transaction of the action. It sends the event only after the commit. If the action throws after the insert, the database keeps no message, and no browser hears about it.

The last argument of `broadcast()` is the room. Only the listeners of `room?roomId=<id>` get the event. The param names come from the channel, so a wrong name fails `nuxt typecheck`. The payload holds only the ID, so the body of the message does not go out on the channel.

`broadcast()` publishes through Redis, so each server process that shares the Redis gets the event and writes it to its own connections. See [Realtime: broadcasting](../realtime.md#broadcasting).

### The router

```bash
./nv make:router message
```

The command writes an empty router at `server/trpc/routers/message.router.ts`. Write the two procedures:

```ts
// server/trpc/routers/message.router.ts
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { postMessageAction } from "#server/actions/message/post-message.action";
import { userTable, messageTable, roomTable } from "#nuxvel/schema";

export const messageRouter = {
  forRoom: authedProcedure
    .input(z.object({ roomId: z.number().int().positive() }))
    .output(z.array(messageSchema))
    .query(async ({ input, ctx }) => {
      const room = await findAuthorized(roomTable, input.roomId, "view");

      return useDb()
        .select({
          id: messageTable.id,
          body: messageTable.body,
          roomId: messageTable.roomId,
          authorId: messageTable.authorId,
          authorName: userTable.name,
          createdAt: messageTable.createdAt,
        })
        .from(messageTable)
        .innerJoin(userTable, eq(userTable.id, messageTable.authorId))
        .where(eq(messageTable.roomId, room.id))
        .orderBy(asc(messageTable.id));
    }),
  post: authedProcedure
    .input(postMessageInput)
    .output(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const row = await postMessageAction(input);
      return { id: row.id };
    }),
};
```

`forRoom` returns the messages of one room, oldest first, with the name of each author. It calls the same `view` rule as the channel. `post` returns only the ID: the page gets the message from `forRoom`.

### Test the broadcast

Replace the generated action test:

```ts
// server/actions/message/post-message.action.test.ts
import { actingAs, expect, expectBroadcast, expectNotBroadcast, expectRow, runAction } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { messageTable } from "#nuxvel/schema";
import { roomMemberFactory, roomFactory, userFactory } from "#nuxvel/factories";

describe("message/post-message action", () => {
  it("stores the message and broadcasts its id after the commit", async () => {
    const ada = await userFactory();
    const room = await roomFactory();
    await roomMemberFactory({ roomId: room.id, userId: ada.id });

    const row = await runAction("message.post-message", { roomId: room.id, body: "Lunch at noon?" }, { actingAs: ada });

    await expectRow(messageTable, { id: row.id, authorId: ada.id, body: "Lunch at noon?" });
    await expectBroadcast("room", "posted", { id: row.id }, { params: { roomId: room.id } });
  });

  it("refuses a user who is not a member, and broadcasts nothing", async () => {
    const room = await roomFactory();

    await expect(
      runAction("message.post-message", { roomId: room.id, body: "Hello?" }, { actingAs: await userFactory() }),
    ).rejects.toBeTrpcError("FORBIDDEN");
    await expectNotBroadcast("room", "posted");
  });

  it("reaches a member who listens to the room, and no other room", async () => {
    const ada = await userFactory();
    const grace = await userFactory();
    const room = await roomFactory();
    const other = await roomFactory();
    await roomMemberFactory({ roomId: room.id, userId: ada.id });
    await roomMemberFactory({ roomId: room.id, userId: grace.id });
    await roomMemberFactory({ roomId: other.id, userId: ada.id });
    const stream = await actingAs(grace).listen(`room?roomId=${room.id}`);

    await actingAs(ada).trpc.message.post({ roomId: other.id, body: "Not for Grace" });
    const { id } = await actingAs(ada).trpc.message.post({ roomId: room.id, body: "Lunch at noon?" });

    expect(await stream.next("posted")).toEqual({ id: expect.any(String), event: "posted", payload: { id } });
  });
});
```

- `expectBroadcast()` checks that the app broadcast the event with these fields, to this room. A `broadcast()` in a transaction counts only after its transaction commits. The event name, the fields and the room params are typed by the channel.
- `expectNotBroadcast()` checks that the refused post sent nothing.
- The third test checks the full path. Grace listens to her room. Ada posts in another room first, then in Grace's room, through the router. The first broadcast that Grace's stream gets is the post in her room. `toEqual` also proves that the payload holds only the ID of the message. The `id` of the stream message is the event ID.
- A listener of a room is also a member of it, so the stream also gets presence events, such as `presence.sync` and `presence.join`. `next("posted")` skips every event with another name. `next()` with no name gives the next event of any name. It fails after 5 seconds when no event arrives.

Test the router in its own file:

```ts
// server/trpc/routers/message.router.test.ts
import { actingAs, expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { messageFactory, roomMemberFactory, roomFactory, userFactory } from "#nuxvel/factories";

describe("message router", () => {
  it("lists the messages of a room oldest first, with the author's name", async () => {
    const ada = await userFactory({ name: "Ada Lovelace" });
    const room = await roomFactory();
    await roomMemberFactory({ roomId: room.id, userId: ada.id });
    const first = await messageFactory({ roomId: room.id, authorId: ada.id });
    const second = await messageFactory({ roomId: room.id, authorId: ada.id });
    await messageFactory();

    const listed = await actingAs(ada).trpc.message.forRoom({ roomId: room.id });

    expect(listed.map((row) => row.id)).toEqual([first.id, second.id]);
    expect(listed[0]).toMatchObject({ authorName: "Ada Lovelace", body: first.body });
  });

  it("refuses a user who is not a member", async () => {
    const room = await roomFactory();
    await messageFactory({ roomId: room.id });

    await expect(actingAs(await userFactory()).trpc.message.forRoom({ roomId: room.id })).rejects.toBeTrpcError(
      "FORBIDDEN",
    );
  });
});
```

The third `messageFactory()` call puts a message in another room, so the first test proves that `forRoom` leaves it out. Run `npm run test:functional`. See [Testing: listening in a test](../realtime.md#listening-in-a-test) and [Testing broadcasts](../realtime.md#testing-broadcasts).

## 6. The room page

The page has four parts: the messages, the typing line, the send form and, for the owner, a form that adds a member. The list and the send form are components, so that chapter 7 can test each one alone.

### The message list

`app/components/` has no generator. Create `app/components/MessageList.vue`:

```vue
<!-- app/components/MessageList.vue -->
<script setup lang="ts">
defineProps<{ messages: RouterOutputs["message"]["forRoom"] }>();
</script>

<template>
  <UEmpty v-if="messages.length === 0" icon="i-lucide-message-circle" title="No messages yet" />
  <ol v-else aria-label="Messages" class="space-y-3">
    <li v-for="message in messages" :key="message.id">
      <p class="text-sm">
        <span class="font-medium">{{ message.authorName }}</span>
        <span v-if="message.id < 0" class="ml-2 text-muted">Sending…</span>
        <DateTime v-else :value="message.createdAt" :options="{ timeStyle: 'short' }" class="ml-2 text-muted" />
      </p>
      <p>{{ message.body }}</p>
    </li>
  </ol>
</template>
```

A message with a negative ID is a message that the server has not stored yet. The send form adds it, as the next section tells. `<DateTime>` shows the time in the timezone of the browser, with no hydration mismatch.

### The send form

Create `app/components/MessageComposer.vue`:

```vue
<!-- app/components/MessageComposer.vue -->
<script setup lang="ts">
import type { FormSubmitEvent } from "@nuxt/ui";
import type { z } from "zod";

const props = defineProps<{ roomId: number }>();
const emit = defineEmits<{ typing: [typing: boolean] }>();

const { user } = useUser();
const state = reactive({ roomId: props.roomId, body: "" });

const { mutate, error } = $api.message.post.useMutation({
  optimistic: {
    key: ({ roomId }) => $api.message.forRoom.key({ roomId }),
    apply: (messages, { roomId, body }) => [
      ...messages,
      { id: -Date.now(), roomId, body, authorId: user.value?.id ?? "", authorName: user.value?.name ?? "", createdAt: new Date() },
    ],
  },
});

function send({ data }: FormSubmitEvent<z.output<typeof postMessageInput>>) {
  mutate(data);
  state.body = "";
  emit("typing", false);
}
</script>

<template>
  <UForm :schema="postMessageInput" :state="state" class="flex items-start gap-2" @submit="send">
    <UFormField name="body" label="Message" class="flex-1">
      <UInput
        v-model="state.body"
        autocomplete="off"
        class="w-full"
        @update:model-value="emit('typing', state.body !== '')"
        @blur="emit('typing', false)"
      />
    </UFormField>
    <UButton type="submit" class="mt-6" icon="i-lucide-send" label="Send" />
  </UForm>
  <UAlert v-if="error" role="alert" color="error" variant="subtle" title="Message not sent" :description="error instanceof Error ? error.message : undefined" />
</template>
```

`<UForm>` checks the input with `postMessageInput`, the schema of the server. An empty message shows "Write a message" under the field and sends nothing. `data` is the output of the schema, so the body is already trimmed.

The `optimistic` option changes the cache around the mutation. When `mutate()` starts, these steps occur:

1. `apply` adds the message to the cached result of `forRoom` for this room, with a negative ID. The list shows it at once, with "Sending…".
2. The form clears the field at once, so the user can type the next message.
3. When the server answers, the mutation fetches `forRoom` again. The stored message, with its real ID and time, replaces the temporary one.
4. When the server refuses, the mutation puts back the list that it had before, and `error` shows the alert.

A chat form clears its field before the answer, so the component uses `.useMutation()` and `<UForm>` directly. `useActionForm()` waits for the answer before its `onSuccess`. See [Frontend: optimistic updates](../frontend.md#optimistic-updates).

The component emits `typing` with `true` while the field has text, and with `false` when the field loses focus or the message goes out. The page sends the flag to the room. The component does not know about presence, so a story can test it with no channel.

### The page

The page is a route with a param, so give the path in quotes:

```bash
./nv make:page "room/[id]"
```

Replace the generated page:

```vue
<!-- app/pages/room/[id].vue -->
<script setup lang="ts">
definePageMeta({ middleware: "auth" });

const id = Number(useRoute().params.id);
const { user } = useUser();
const room = $api.room.byId.useQuery({ id });

const messages = useLiveQuery($api.message.forRoom.queryOptions({ roomId: id }), {
  channel: "room",
  params: { roomId: id },
  refetch: { posted: true },
});
const { members, setState } = usePresence("room", { roomId: id });
const others = computed(() => members.value.filter((member) => member.userId !== user.value?.id));
const { status } = useChannel("room", { params: { roomId: id } });

const memberForm = useActionForm($api.room.addMember, {
  toast: "Member added",
  defaults: { roomId: id, email: "" },
  onSuccess: () => {
    memberForm.state.email = "";
  },
});

useSeo(() => ({ title: room.data?.name ?? "Room" }));
</script>

<template>
  <div class="max-w-2xl space-y-6">
    <div class="flex items-center justify-between gap-4">
      <h1 class="text-2xl font-semibold">{{ room.data?.name }}</h1>
      <div class="flex items-center gap-4">
        <UBadge v-if="status === 'reconnecting'" color="warning" label="Reconnecting" />
        <PresenceAvatars :members="members" />
      </div>
    </div>
    <QueryState :query="messages">
      <template #default="{ data }">
        <MessageList :messages="data" />
      </template>
    </QueryState>
    <TypingIndicator :members="others" />
    <MessageComposer :room-id="id" @typing="(typing) => setState({ typing })" />
    <UForm
      v-if="room.data?.ownerId === user?.id"
      :ref="memberForm.ref"
      :schema="memberForm.schema"
      :state="memberForm.state"
      class="flex items-start gap-2"
      @submit="memberForm.submit"
    >
      <UFormField name="email" label="Add a member by email" class="w-72">
        <UInput v-model="memberForm.state.email" type="email" class="w-full" />
      </UFormField>
      <UButton type="submit" class="mt-6" color="neutral" variant="outline" :loading="memberForm.pending" label="Add" />
    </UForm>
  </div>
</template>
```

Each realtime part of the page does one job:

- `useLiveQuery()` runs the `forRoom` query and listens to the room `room?roomId=<id>`. On each `posted` event, the query fetches the messages again. An event of another room does not reach the page. The page uses `refetch` and not `on`, because the payload holds no message to patch into the list.
- `usePresence("room", { roomId: id })` joins the same room as a member. `members` lists each signed-in user in the room, the current user too. A user with two tabs is one member.
- `<PresenceAvatars>` shows the members as a group of avatars, with the name of each in a tooltip. A member without an image shows initials.
- `<TypingIndicator>` shows `Ada Lovelace is typing…` for each other member whose state has `typing: true`. It is a polite live region, so a screen reader reads it. The page gives it `others`, because nobody needs to see that they type.
- `setState({ typing })` merges the flag into the state of the current user. Calls in the same 300 ms go to the server as one request, so the page can call it on each key press.
- `useChannel("room", { params: { roomId: id } })` gives `status`, the state of the connection. The page uses it only for the badge.

All of these share one connection to the server, an `EventSource` on `/api/channels`. They join the room when the page mounts, and leave it when the page unmounts. They do nothing during server rendering.

The add form shows only to the owner. That is only for the user: the action calls `authorize()`, so a direct call by another member fails. The `toast` option shows the toast "Member added". The `field` of `room.member-unknown` puts its message under the email field.

### When the connection drops

A browser loses its connection when the network drops, the laptop sleeps or the server restarts. You do not write code for the reconnect. These steps occur:

1. `status` changes to `reconnecting`, and the page shows the badge.
2. The browser opens the connection again after a random delay. The first delay is up to 1 second. Each failed attempt doubles the upper bound, up to 30 seconds. So the clients of a restarted server do not all come back at the same moment.
3. The connection sends the ID of the last event that it got on each channel. Redis keeps the last 500 events of each room. The server sends the events that the page missed first, in order. Each missed `posted` event fetches the messages again.
4. When the page missed more than the buffer holds, the server sends `resync` first. `useLiveQuery()` then fetches the query again.
5. The room sends its full member list again, so `members` is correct after the reconnect.
6. `authorize` runs again for each channel. A user who lost access to the room is refused.

See [Realtime: catching up after a reconnect](../realtime.md#catching-up-after-a-reconnect) and [Realtime: reconnecting](../realtime.md#reconnecting).

### See it work

```bash
npm run dev
```

Sign in as `demo@example.com` with the password `demo-password` in one browser. Sign in as `grace@example.com` in a private window. Open `/room` in each, and select **General**. Each page shows the three seeded messages and two avatars, `DU` and `GH`. Type in the **Message** field of one window. The other window shows `Demo User is typing…`. Select **Send**. The message shows at once in the first window, and then in the second window. The typing line goes away.

## 7. Component tests

A story is one state of one component. Its `play` function acts on the story and checks the result. `npm run test:ui` runs each story in a headless Chromium. `mockTrpc` answers the tRPC calls, so the stories need no server. Generate a story for each component:

```bash
./nv make:story MessageList
./nv make:story MessageComposer
```

Each command writes a story that checks that the component rendered. Replace the list story:

```ts
// app/components/MessageList.stories.ts
import type { Meta, StoryObj } from "@storybook-vue/nuxt";
import { expect, page, text } from "@nuxvel/nuxt/storybook/test";
import MessageList from "./MessageList.vue";

const sent = { id: 1, roomId: 7, body: "Lunch at noon?", authorId: "user-2", authorName: "Grace Hopper", createdAt: new Date("2026-10-01T11:58:00Z") };
const sending = { id: -1, roomId: 7, body: "Yes, see you there", authorId: "user-1", authorName: "Ada Lovelace", createdAt: new Date() };

const meta = { component: MessageList, args: { messages: [sent, sending] } } satisfies Meta<typeof MessageList>;
export default meta;

export const MarksAMessageThatIsSending: StoryObj<typeof meta> = {
  play: async () => {
    await expect(text(page, "Lunch at noon?")).toBeVisible();
    await expect(text(page, "Yes, see you there")).toBeVisible();
    await expect(text(page, "Sending…")).toHaveCount(1);
  },
};

export const Empty: StoryObj<typeof meta> = {
  args: { messages: [] },
  play: async () => {
    await expect(text(page, "No messages yet")).toBeVisible();
  },
};
```

The first story gives the list one stored message and one optimistic message. Only the optimistic message shows "Sending…".

The send form story needs a signed-in user, because the optimistic message takes the name from `useUser()`. `mockUser` answers the session request. `trpcSpy` answers `message.post` and records each call. `fn()` from `storybook/test` records the `typing` events, because Storybook passes the `onTyping` arg as the listener of the event:

```ts
// app/components/MessageComposer.stories.ts
import type { Meta, StoryObj } from "@storybook-vue/nuxt";
import { mockTrpc, mockUser, trpcSpy, TRPCError } from "@nuxvel/nuxt/storybook/mocks";
import { alert, button, expect, field, page, text } from "@nuxvel/nuxt/storybook/test";
import { fn } from "storybook/test";
import MessageComposer from "./MessageComposer.vue";

const post = trpcSpy("message.post", () => ({ id: 1 }));
const ada = mockUser({ name: "Ada Lovelace" });

const meta = { component: MessageComposer, args: { roomId: 7, onTyping: fn() } } satisfies Meta<typeof MessageComposer>;
export default meta;

export const Sends: StoryObj<typeof meta> = {
  parameters: { msw: [ada, mockTrpc({ message: { post } })] },
  play: async ({ args }) => {
    await field(page, "Message").pressSequentially("Lunch at noon?", { delay: 20 });
    await expect(args.onTyping).toHaveBeenLastCalledWith(true);

    await button(page, "Send").click();

    await expect(post).toHaveBeenCalledWith({ roomId: 7, body: "Lunch at noon?" });
    await expect(field(page, "Message")).toHaveValue("");
    await expect(args.onTyping).toHaveBeenLastCalledWith(false);
  },
};

export const EmptyMessage: StoryObj<typeof meta> = {
  parameters: { msw: [ada, mockTrpc({ message: { post } })] },
  play: async () => {
    await field(page, "Message").fill("   ");
    await button(page, "Send").click();

    await expect(text(page, "Write a message")).toBeVisible();
    await expect(post).not.toHaveBeenCalled();
  },
};

export const RefusedByTheServer: StoryObj<typeof meta> = {
  parameters: {
    msw: [ada, mockTrpc({ message: { post: () => { throw new TRPCError({ code: "FORBIDDEN", message: "You are not a member of this room" }); } } })],
  },
  play: async () => {
    await field(page, "Message").fill("Hello?");
    await button(page, "Send").click();

    await expect(alert(page)).toContainText("You are not a member of this room");
  },
};
```

- `Sends` types one key at a time, so the component emits `typing` on each key. After the send, the spy has the trimmed input, the field is empty and the last `typing` event is `false`.
- `EmptyMessage` shows that the schema stops a blank message in the browser. The spy has no call.
- `RefusedByTheServer` throws from the mock, as a real procedure does. The handler sends the error with the same shape and status as the nuxvel server. The alert shows its message.

```bash
npm run test:ui
```

```
 Test Files  4 passed (4)
      Tests  9 passed (9)
```

The other two files are the starter's stories of `UserMenu` and the error page. Each story also gets an accessibility check with axe, with no code. See [Storybook: play functions](../storybook.md#play-functions) and [Testing: component tests](../testing.md#component-tests).

## 8. Browser tests

Presence and a broadcast need a real browser, because a page must join the room and receive the events. Generate a browser test:

```bash
./nv make:test room --e2e
```

The command writes `tests/e2e/room.test.ts`, which opens `/room`. Replace it:

```ts
// tests/e2e/room.test.ts
import { actingAs, button, expect, expectPresent, field, heading, text } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { roomMemberFactory, roomFactory, userFactory } from "#nuxvel/factories";

async function roomWithAdaAndGrace() {
  const ada = await userFactory({ name: "Ada Lovelace" });
  const grace = await userFactory({ name: "Grace Hopper" });
  const room = await roomFactory({ name: "Launch", ownerId: ada.id });
  await roomMemberFactory({ roomId: room.id, userId: ada.id });
  await roomMemberFactory({ roomId: room.id, userId: grace.id });

  return { ada, grace, room };
}

describe("a chat room in two browsers", () => {
  it("shows who is here, who types, and each new message without a reload", async () => {
    const { ada, grace, room } = await roomWithAdaAndGrace();

    const adaPage = await actingAs(ada).visit({ name: "room-id", params: { id: room.id } });
    const gracePage = await actingAs(grace).visit({ name: "room-id", params: { id: room.id } });

    await expect(heading(adaPage, "Launch")).toBeVisible();
    await expect(adaPage.getByRole("img", { name: "Grace Hopper" })).toBeVisible();
    await expectPresent("room", { roomId: room.id }, grace);

    await field(adaPage, "Message").pressSequentially("Lunch at noon?");
    await expect(text(gracePage, "Ada Lovelace is typing…")).toBeVisible();

    await button(adaPage, "Send").click();
    await expect(text(gracePage, "Lunch at noon?")).toBeVisible();
    await expect(text(gracePage, "Ada Lovelace is typing…")).toBeHidden();
  });

  it("shows a message at once, before the server answers", async () => {
    const { ada, room } = await roomWithAdaAndGrace();
    const page = await actingAs(ada).visit({ name: "room-id", params: { id: room.id } });
    const { promise: answer, resolve: letTheServerAnswer } = Promise.withResolvers<void>();
    await page.route("**/api/trpc/message.post*", async (route) => {
      await answer;
      await route.continue();
    });

    await field(page, "Message").fill("Lunch at noon?");
    await button(page, "Send").click();

    await expect(text(page, "Lunch at noon?")).toBeVisible();
    await expect(text(page, "Sending…")).toBeVisible();
    await expect(field(page, "Message")).toHaveValue("");

    letTheServerAnswer();
    await expect(text(page, "Sending…")).toBeHidden();
    await expect(text(page, "Lunch at noon?")).toBeVisible();
  });
});
```

Each `visit()` opens a new browser context, so `adaPage` and `gracePage` are two users with two sessions. `{ name: "room-id", params }` is a typed route location: a page that moves fails the typecheck.

The first test follows one journey across the two pages:

1. Ada's page shows Grace's avatar. The avatar is an image named after its member. `expectPresent()` then checks on the server that Grace is a member of the room.
2. Ada types. Grace's page shows the typing line. `expect` tries again until the line shows, so the test does not wait for the 300 ms of `setState()` itself.
3. Ada sends. Grace's page shows the message, from the broadcast and the refetch. The typing line goes away, because the send set `typing` to `false`.

The second test holds the request of `message.post` with `page.route()`. The message and "Sending…" show while the request waits in the browser. So the test proves that the list does not wait for the server. Then the test lets the request go. "Sending…" goes away when the mutation fetches the list again.

`visit()` also fails a test on a page error, a `console.error` message or a failed request. So each test also proves that the realtime connection opened with no error.

```bash
npm run test:e2e
```

```
◇ Dev services are already healthy (docker compose)
◇ Using the test build from 03/10/2026, 12:36:05 am

 Test Files  2 passed (2)
      Tests  6 passed (6)
```

`npm run test:e2e` first installs the Playwright browser. The other file is the starter's `tests/e2e/home.test.ts`. Its smoke test opens each page without params, so it now also opens `/room` and `/room/new`. A guest goes from both to the sign-in page, with no error. See [Testing: end-to-end tests](../testing.md#end-to-end-tests) and [Testing: visit](../testing.md#visit).

## 9. Run every test layer

```bash
npm run typecheck
npm run test:functional
npm run test:ui
npm run test:e2e
npm run test:arch
```

```
 Test Files  10 passed (10)
      Tests  24 passed (24)
```

```
✔ All architecture rules pass
```

The functional run has the generated factory tests and `room.router.test.ts`, and the tests of chapters 2 to 5. `npm test` runs `test:functional`, then `test:ui`. It does not run the browser tests.

`./nv test:arch` checks the rules of the framework. It also checks two rules for tests. A functional test does not read the HTML of a page. A test or a story imports `expect` only from `@nuxvel/nuxt/testing` or `@nuxvel/nuxt/storybook/test`. See [CLI: nuxvel test:arch](../cli.md#nuxvel-testarch).

Each check of this tutorial is in one layer:

| Check | Layer | File |
|---|---|---|
| A guest and a non-member cannot listen | Functional | `server/channels/room.channel.test.ts` |
| A listener is a member of the room | Functional | `server/channels/room.channel.test.ts` |
| A post broadcasts after the commit, and reaches only the listeners of its room | Functional | `server/actions/message/post-message.action.test.ts` |
| Only members read a room, only the owner adds a member | Functional | `server/actions/room/add-member.action.test.ts`, `server/trpc/routers/message.router.test.ts` |
| A sending message shows "Sending…" | Component | `app/components/MessageList.stories.ts` |
| The form sends, stops a blank message, shows a refusal and emits `typing` | Component | `app/components/MessageComposer.stories.ts` |
| Two users see each other, the typing line and a new message | End-to-end | `tests/e2e/room.test.ts` |
| A message shows before the server answers | End-to-end | `tests/e2e/room.test.ts` |

## What this tutorial leaves out

- The message list has no pages. `forRoom` returns every message of the room. A busy room needs a cursor, for example the last 50 messages before an ID. See [Database: pagination](../database.md#pagination).
- A member cannot leave a room, and the owner cannot remove a member. The `view` rule then refuses the user at the next `ping` of the connection.
- No test drops the connection. The reconnect and the replay come from the framework, and this app adds no code to them.
- The page does not scroll to the newest message.
