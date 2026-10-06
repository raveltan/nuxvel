# Tutorial: testing in depth

## Introduction

This tutorial builds one small feature test-first: meeting room bookings. A signed-in user books a room for a time, and the app checks a set of rules. The booker gets a confirmation mail and can cancel up to 24 hours before the start. A search finds bookings after the user stops typing.

Each chapter starts with a test that fails. Then you write the code, and the same test passes. Each chapter shows the failure that you see, so you know that the test checks the new code.

A nuxvel app has three layers of tests. Each check goes in the one layer that owns it:

| Layer | Runs | Owns | This tutorial |
|---|---|---|---|
| Functional | `./nv test`, real Postgres, the built server | the result or the error of a procedure, the rows, the jobs, the mail, the time rules, the query count | chapters 3 to 7 |
| Component | `npm run test:ui`, one story in Chromium, MSW instead of the server | the states of one component: what it sends, the messages it shows, the accessibility of each state | chapter 8 |
| End-to-end | `npm run test:e2e`, a real browser on the real server | a journey across pages with a real session, the browser timers | chapter 9 |

When you do not know where a check goes, ask what it needs. A row, a job or a mail makes it functional. One component in one state, with no server, makes it a component test. More than one page or a real session makes it end-to-end. See [Testing](../testing.md) for the reference of each helper.

You need Node.js 24, Docker, and about 90 minutes. Run every command from the app folder.

## 1. Create the app

```bash
npm create nuxvel@latest rooms
cd rooms
npm install
./nv services up
./nv test
```

```
◇ Dev services are already healthy (docker compose)
◇ Built the app for tests: no earlier build (48.8s)

 Test Files  2 passed (2)
      Tests  5 passed (5)
```

`./nv services up` starts Postgres, Redis, Mailpit and SeaweedFS from `docker-compose.yml`, and they stay running. `./nv test` builds the app for tests once, and the next runs use the same build while the app files do not change. A change to a test file does not start a new build.

The starter has one script for each layer, and two scripts that check the code without a test run:

```json
{
  "scripts": {
    "test": "npm run test:functional && npm run test:ui",
    "test:functional": "nuxvel test",
    "pretest:ui": "playwright-core install chromium-headless-shell",
    "test:ui": "nuxvel test:ui",
    "pretest:e2e": "playwright-core install chromium-headless-shell",
    "test:e2e": "nuxvel test:e2e",
    "test:arch": "nuxvel test:arch",
    "typecheck": "nuxt typecheck"
  }
}
```

| Script | Does |
|---|---|
| `npm test` | the functional tests, then the component tests |
| `npm run test:functional` | `nuxvel test`, the same as `./nv test`: the functional tests |
| `npm run test:ui` | installs the headless browser, then runs each story under `app/` as a component test |
| `npm run test:e2e` | installs the headless browser, then runs the tests in `tests/e2e/` |
| `npm run test:arch` | the architecture rules, see chapter 10 |
| `npm run typecheck` | `nuxt typecheck`. Vitest does not check types, so run it next to the tests |

`npm test` does not run the end-to-end tests. Run `npm run test:e2e` for them.

## 2. Rooms and bookings

A room has a name and a capacity. A booking has a title, a room, a booker, a start, an end and a number of guests. This chapter adds no behavior, so it starts with no failing test. The factories that it writes come with their own tests.

```bash
./nv make:schema room name capacity:integer
./nv make:schema booking title room:references booker:references=user starts_at:timestamp ends_at:timestamp guests:integer
```

`booker:references=user` points at `userTable` of the auth schema. Each command writes the Drizzle table in `server/database/schema/` and the Zod schemas in `shared/schemas/`. See [Validation: defining a schema](../validation.md#defining-a-schema).

The action takes the booker from the signed-in user, so the client must not send `bookerId`. The app has no update of a booking. Delete `bookerId` and `updateBookingInput` from the generated file:

```ts
// shared/schemas/booking.ts
import { z } from "zod";

export const bookingIdInput = z.object({
  id: z.number().int().positive(),
});

export const createBookingInput = z.object({
  title: z.string().trim().min(1).max(255),
  roomId: z.number().int().positive(),
  startsAt: z.date(),
  endsAt: z.date(),
  guests: z.number().int(),
});

export const bookingSchema = z.object({
  id: z.number(),
  title: z.string(),
  roomId: z.number(),
  bookerId: z.string(),
  startsAt: z.date(),
  endsAt: z.date(),
  guests: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
```

Write the migration and apply it to the dev database:

```bash
./nv db:generate --name rooms-and-bookings
./nv db:migrate
```

The tests do not need `db:migrate`. Each run creates the test database again and applies the migrations.

### Factories

```bash
./nv make:factory room
./nv make:factory booking
```

Each command writes a factory in `server/factories/` and a test next to it. The generated values come from the type and the name of each column. They are a start. A room called `faker.person.fullName()` and a booking that ends before it starts are not real data. Change the two factories:

```ts
// server/factories/room.factory.ts
import { defineFactory, sequence } from "@nuxvel/nuxt/factories";
import { roomTable } from "#nuxvel/schema";

export const roomFactory = defineFactory(roomTable, {
  name: sequence((n) => `Room ${n}`),
  capacity: 8,
});
```

```ts
// server/factories/booking.factory.ts
import { faker } from "@faker-js/faker";
import { now } from "@nuxvel/nuxt/database";
import { defineFactory } from "@nuxvel/nuxt/factories";
import { bookingTable } from "#nuxvel/schema";
import { roomFactory } from "./room.factory";
import { userFactory } from "./users.factory";

const hour = 60 * 60 * 1000;

export const bookingFactory = defineFactory(bookingTable, {
  title: () => faker.company.catchPhrase(),
  roomId: async () => (await roomFactory()).id,
  bookerId: async () => (await userFactory()).id,
  startsAt: () => new Date(now().getTime() + 7 * 24 * hour),
  endsAt: (booking) => new Date(booking.startsAt.getTime() + hour),
  guests: 2,
});
```

- `sequence((n) => ...)` gives each room a new number, so two rooms never have the same name.
- `roomId` and `bookerId` insert a parent row for each booking, unless a test gives the column.
- `startsAt` reads `now()` from `@nuxvel/nuxt/database`, not `new Date()`. In chapter 5, the test clock moves `now()`, and the factory follows it.
- `endsAt` has a parameter, so it is a [field that reads other fields](../testing.md#fields-that-read-other-fields). It runs after the other columns have a value, and a booking lasts one hour.

```bash
./nv test server/factories
```

```
 Test Files  2 passed (2)
      Tests  2 passed (2)
```

The next chapters also use two more parts of factories:

- A state is a factory with other defaults. `roomFactory.state({ capacity: 2 })` makes small rooms.
- A relation sets a foreign key from a row. `bookingFactory.for("bookerId", ada)` books for Ada.

### A scenario

Several tests need a room that is already booked. Put that set-up in a scenario, a plain async function in `tests/scenarios/`:

```ts
// tests/scenarios/booked-room.ts
import { bookingFactory, roomFactory, userFactory } from "#nuxvel/factories";

export async function bookedRoom(at: { startsAt: Date; endsAt: Date }) {
  const booker = await userFactory();
  const room = await roomFactory();
  const booking = await bookingFactory.for("roomId", room).for("bookerId", booker)(at);

  return { booker, room, booking };
}
```

The rows keep the types of their factories, so `bookedRoom(...).booking.startsAt` is a `Date`.

## 3. Book a room

Start with the test. A signed-in user books a room, and a guest cannot:

```ts
// tests/functional/bookings.test.ts
import { actingAs, expect, expectRow, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { bookingTable } from "#nuxvel/schema";
import { roomFactory, userFactory } from "#nuxvel/factories";

function sprintPlanning(roomId: number) {
  return {
    title: "Sprint planning",
    roomId,
    startsAt: new Date("2030-01-07T09:00:00Z"),
    endsAt: new Date("2030-01-07T10:00:00Z"),
    guests: 4,
  };
}

describe("booking a room", () => {
  it("books a room for the signed-in user", async () => {
    const ada = await userFactory();
    const room = await roomFactory();

    const booking = await actingAs(ada).trpc.booking.create(sprintPlanning(room.id));

    expect(booking).toMatchObject({ title: "Sprint planning", bookerId: ada.id });
    await expectRow(bookingTable, { id: booking.id, roomId: room.id, bookerId: ada.id, guests: 4 });
  });

  it("asks a guest to sign in", async () => {
    const room = await roomFactory();

    await expect(guest().trpc.booking.create(sprintPlanning(room.id))).rejects.toBeTrpcError("UNAUTHORIZED");
  });
});
```

- `expect` comes from `@nuxvel/nuxt/testing`, never from `vitest`. `describe` and `it` come from `vitest`.
- `actingAs(ada).trpc` calls the procedure in the built server as Ada, with the context of a real request. `guest().trpc` calls it with no session.
- `expectRow(table, match)` reads the database on its own connection. It passes when one committed row matches every column in `match`.

```bash
./nv test tests/functional/bookings.test.ts
```

```
 FAIL  |functional| tests/functional/bookings.test.ts > booking a room > books a room for the signed-in user
TRPCError: No procedure found on path "booking,create"

 FAIL  |functional| tests/functional/bookings.test.ts > booking a room > asks a guest to sign in
Error: expected tRPC error code "UNAUTHORIZED", got "NOT_FOUND"
```

There is no `booking.create` procedure yet. tRPC prints the path with a comma. `npm run typecheck` also fails on the same line, because `actingAs().trpc` is typed by the app router.

Generate the action and the router:

```bash
./nv make:action booking/create-booking
./nv make:router booking
```

`make:action` also writes `create-booking.action.test.ts`. This tutorial tests the action through its procedure and in the data table of chapter 4, so delete that file. Write the action. It takes the booker from the actor:

```ts
// server/actions/booking/create-booking.action.ts
import { bookingTable } from "#nuxvel/schema";

export const createBookingAction = defineAction({
  input: createBookingInput,
  handler: async (input, ctx) => {
    return useDb()
      .insert(bookingTable)
      .values({ ...input, bookerId: ctx.actor.id })
      .returning()
      .then(firstOrFail);
  },
});
```

```ts
// server/trpc/routers/booking.router.ts
import { createBookingAction } from "#server/actions/booking/create-booking.action";

export const bookingRouter = {
  create: authedProcedure
    .input(createBookingInput)
    .output(bookingSchema)
    .mutation(({ input, ctx }) => createBookingAction(input, { actor: ctx.actor })),
};
```

```bash
./nv test tests/functional/bookings.test.ts
```

```
◇ Built the app for tests: server/actions/booking/create-booking.action.ts added (67.5s)

 Test Files  1 passed (1)
      Tests  2 passed (2)
```

The app changed, so the run built it again. The next runs use this build while the app does not change.

### Three ways to be a user

`actingAs(user)` makes a session without a password. It is the fast way, and most tests use it. `signIn(email, password)` signs in through the real `/api/auth/sign-in/email` endpoint. Use it once, to show that the procedure works with the session that the sign-in form makes. Add `signIn` to the import, and add this test:

```ts
// tests/functional/bookings.test.ts
  it("books a room with a session from the sign-in form", async () => {
    const ada = await userFactory.withPassword("correct-horse-battery")();
    const room = await roomFactory();

    const { trpc } = await signIn(ada.email, "correct-horse-battery");
    const booking = await trpc.booking.create(sprintPlanning(room.id));

    await expectRow(bookingTable, { id: booking.id, bookerId: ada.id });
  });
```

`userFactory.withPassword(password)` also writes the credential account. This test passes at once: it adds no rule, it checks the session path.

## 4. The booking rules

A booking must follow five rules:

| Rule | Message | Where it lives |
|---|---|---|
| The title is not blank | Give the booking a title | the Zod schema |
| One guest or more | Book for 1 guest or more | the Zod schema |
| The end is after the start | End the booking after it starts | the Zod schema |
| The room holds the guests | `<room> holds <capacity> people` | the action, because it needs the room row |
| The room is free at that time | The room is booked at this time | the action, because it needs the other bookings |

The schema rules run in the browser and on the server, with the same message. The action rules need rows, so they run only on the server.

The tests differ only by their data, so write each test once and give it a list of cases with `it.for`. The rules hold for the procedure and for the action, so a `describe.for` runs the lists through both. Add `runAction` to the import, and add the tables at the end of the file:

```ts
// tests/functional/bookings.test.ts
const smallRoomFactory = roomFactory.state({ capacity: 2 });

type BookingInput = ReturnType<typeof sprintPlanning>;

describe.for([
  { name: "the procedure", create: (user: { id: string }, input: BookingInput) => actingAs(user).trpc.booking.create(input) },
  {
    name: "the action",
    create: (user: { id: string }, input: BookingInput) => runAction("booking.create-booking", input, { actingAs: user }),
  },
])("the booking rules, through $name", ({ create }) => {
  it.for<{ name: string; change: Partial<BookingInput>; errors: Record<string, string> }>([
    { name: "a blank title", change: { title: "   " }, errors: { title: "Give the booking a title" } },
    { name: "no guests", change: { guests: 0 }, errors: { guests: "Book for 1 guest or more" } },
    {
      name: "an end before the start",
      change: { endsAt: new Date("2030-01-07T08:00:00Z") },
      errors: { endsAt: "End the booking after it starts" },
    },
  ])("refuses $name", async ({ change, errors }) => {
    const room = await roomFactory();

    await expect(create(await userFactory(), { ...sprintPlanning(room.id), ...change })).rejects.toHaveValidationErrors(
      errors,
    );
  });

  it.for([
    { name: "more guests than the room holds", room: () => smallRoomFactory(), code: "booking.over-capacity" },
    {
      name: "a room that is booked at that time",
      room: async () => {
        const { room } = await bookedRoom({
          startsAt: new Date("2030-01-07T09:30:00Z"),
          endsAt: new Date("2030-01-07T10:30:00Z"),
        });
        return room;
      },
      code: "booking.overlap",
    },
  ] as const)("refuses $name", async ({ room: makeRoom, code }) => {
    const room = await makeRoom();

    await expect(create(await userFactory(), sprintPlanning(room.id))).rejects.toBeActionError(code);
  });
});
```

Import `bookedRoom` from `../scenarios/booked-room`. Some details of the tables:

- `toHaveValidationErrors({ field: message })` checks the message of each field that you name. A field passes when one of its messages matches.
- `toBeActionError(code)` checks the code of an action's `fail()`. It passes for the rejection of `runAction` and of `actingAs().trpc`.
- The type argument of the first `it.for` gives each case the same type. Without it, TypeScript infers a union of the cases, and `errors` does not fit `toHaveValidationErrors`. `as const` on the second list keeps each `code` a literal, so a misspelled code fails the typecheck.
- `$name` in a title reads the `name` of the case. The report shows `the booking rules, through the action > refuses no guests`.

The rows in a case list are functions, never rows. Vitest builds the list once, when it collects the tests, and the setup empties the tables after each test. A row that the list made would be gone for the second case. So `room: () => smallRoomFactory()` makes the row inside the test, and the overlap case calls the scenario there too.

```bash
./nv test tests/functional/bookings.test.ts
```

```
Error: field title: expected message "Give the booking a title", received Array [
  "Too small: expected string to have >=1 characters",
]

AssertionError: promise resolved "{ id: 1, …(8) }" instead of rejecting
```

The blank title fails with the default Zod message. The other cases save the booking, so the promise resolves. Give the schema its messages and the third rule:

```ts
// shared/schemas/booking.ts
export const createBookingInput = z
  .object({
    title: z.string().trim().min(1, "Give the booking a title").max(255),
    roomId: z.number().int().positive(),
    startsAt: z.date(),
    endsAt: z.date(),
    guests: z.number().int().min(1, "Book for 1 guest or more"),
  })
  .refine((booking) => booking.endsAt > booking.startsAt, {
    path: ["endsAt"],
    message: "End the booking after it starts",
  });
```

`path: ["endsAt"]` puts the message on the `endsAt` field, so the form shows it under that input. Then declare the two server rules in the action:

```ts
// server/actions/booking/create-booking.action.ts
import { and, eq, gt, lt } from "drizzle-orm";
import { bookingTable, roomTable } from "#nuxvel/schema";

export const createBookingAction = defineAction({
  input: createBookingInput,
  errors: {
    "booking.over-capacity": "The room is too small for this many guests",
    "booking.overlap": "The room is booked at this time",
  },
  handler: async (input, ctx, fail) => {
    const room = await findOrFail(roomTable, input.roomId);
    if (input.guests > room.capacity) fail("booking.over-capacity", `${room.name} holds ${room.capacity} people`);

    const [overlap] = await useDb()
      .select({ id: bookingTable.id })
      .from(bookingTable)
      .where(
        and(
          eq(bookingTable.roomId, room.id),
          lt(bookingTable.startsAt, input.endsAt),
          gt(bookingTable.endsAt, input.startsAt),
        ),
      )
      .limit(1);
    if (overlap) fail("booking.overlap");

    return useDb()
      .insert(bookingTable)
      .values({ ...input, bookerId: ctx.actor.id })
      .returning()
      .then(firstOrFail);
  },
});
```

Two bookings overlap when each one starts before the other ends. `fail(code, message)` replaces the default message, so the form can name the room.

```bash
./nv test tests/functional/bookings.test.ts --reporter=verbose
```

```
 ✓ |functional| tests/functional/bookings.test.ts > the booking rules, through the procedure > refuses a blank title
 ✓ |functional| tests/functional/bookings.test.ts > the booking rules, through the procedure > refuses no guests
 ✓ |functional| tests/functional/bookings.test.ts > the booking rules, through the procedure > refuses an end before the start
 ✓ |functional| tests/functional/bookings.test.ts > the booking rules, through the procedure > refuses more guests than the room holds
 ✓ |functional| tests/functional/bookings.test.ts > the booking rules, through the procedure > refuses a room that is booked at that time
 ✓ |functional| tests/functional/bookings.test.ts > the booking rules, through the action > refuses a blank title
 ...
```

Each case reports on its own, so one failure does not hide the others. A new rule is one more line in a list.

## 5. Time

Two rules depend on the clock. A booking cannot start in the past. A booker can cancel only up to 24 hours before the start. A test that reads the real clock passes today and fails next year. Control the clock instead:

| Fixture | Does |
|---|---|
| `freezeTime(date)` | stops the app's clock at `date` and returns it |
| `travelBy({ days, hours, minutes, seconds })` | moves the app's clock forward |
| `travelTo(date)` | sets the app's clock to `date` |

The fixtures move `now()` in the server and in the test process. The setup puts the real time back after each test.

Add the past rule to the first `describe`, and a new `describe` for cancelling. Add `expectNoRow`, `freezeTime` and `travelBy` to the import:

```ts
// tests/functional/bookings.test.ts
  it("refuses a booking that starts in the past", async () => {
    await freezeTime(new Date("2030-01-07T09:30:00Z"));
    const room = await roomFactory();

    await expect(actingAs(await userFactory()).trpc.booking.create(sprintPlanning(room.id))).rejects.toBeActionError(
      "booking.in-the-past",
    );
  });
```

```ts
// tests/functional/bookings.test.ts
describe("cancelling a booking", () => {
  const nextWednesday = { startsAt: new Date("2026-03-04T09:00:00Z"), endsAt: new Date("2026-03-04T10:00:00Z") };

  it("cancels the booking up to 24 hours before it starts", async () => {
    await freezeTime(new Date("2026-03-02T08:00:00Z"));
    const { booker, booking } = await bookedRoom(nextWednesday);

    await actingAs(booker).trpc.booking.cancel({ id: booking.id });

    await expectNoRow(bookingTable, { id: booking.id });
  });

  it("keeps the booking in the last 24 hours", async () => {
    await freezeTime(new Date("2026-03-02T08:00:00Z"));
    const { booker, booking } = await bookedRoom(nextWednesday);

    await travelBy({ days: 1, hours: 2 });

    await expect(actingAs(booker).trpc.booking.cancel({ id: booking.id })).rejects.toBeActionError(
      "booking.too-late-to-cancel",
    );
    await expectRow(bookingTable, { id: booking.id });
  });

  it.for([
    { name: "a guest", caller: async () => guest().trpc, code: "UNAUTHORIZED" },
    { name: "another user", caller: async () => actingAs(await userFactory()).trpc, code: "FORBIDDEN" },
  ] as const)("refuses $name", async ({ caller, code }) => {
    await freezeTime(new Date("2026-03-02T08:00:00Z"));
    const { booking } = await bookedRoom(nextWednesday);
    const trpc = await caller();

    await expect(trpc.booking.cancel({ id: booking.id })).rejects.toBeTrpcError(code);
    await expectRow(bookingTable, { id: booking.id });
  });
});
```

- The frozen time is Monday 08:00, and the booking starts on Wednesday at 09:00. `travelBy({ days: 1, hours: 2 })` moves the clock to Tuesday 10:00, 23 hours before the start.
- `expectNoRow(table, match)` passes when no row matches. After a refusal, `expectRow` shows that the booking is still there.
- The callers of the refusal list are functions again, because `actingAs(await userFactory())` makes a row.

```bash
./nv test tests/functional/bookings.test.ts
```

```
 FAIL  |functional| tests/functional/bookings.test.ts > booking a room > refuses a booking that starts in the past
AssertionError: promise resolved "{ id: 1, …(8) }" instead of rejecting

 FAIL  |functional| tests/functional/bookings.test.ts > cancelling a booking > cancels the booking up to 24 hours before it starts
TRPCError: No procedure found on path "booking,cancel"

 FAIL  |functional| tests/functional/bookings.test.ts > cancelling a booking > keeps the booking in the last 24 hours
Error: expected an ActionError ({ code: "UNPROCESSABLE_CONTENT", actionCode }), got [TRPCError: No procedure found on path "booking,cancel"]

 FAIL  |functional| tests/functional/bookings.test.ts > cancelling a booking > refuses a guest
Error: expected tRPC error code "UNAUTHORIZED", got "NOT_FOUND"
```

In the first failure, the resolved row has `createdAt: 2030-01-07T09:30:00.000Z`, the frozen time. The app wrote the row on the test clock.

Add the past rule to the create action. `now()` is auto-imported on the server:

```ts
// server/actions/booking/create-booking.action.ts
  errors: {
    "booking.over-capacity": "The room is too small for this many guests",
    "booking.overlap": "The room is booked at this time",
    "booking.in-the-past": "Choose a start time in the future",
  },
  handler: async (input, ctx, fail) => {
    if (input.startsAt <= now()) fail("booking.in-the-past");
```

Only the booker can cancel. Write that rule in a policy:

```bash
./nv make:policy booking
./nv make:action booking/cancel-booking
```

Delete the generated `cancel-booking.action.test.ts`, as in chapter 3.

```ts
// server/policies/booking.policy.ts
import { bookingTable } from "#nuxvel/schema";

export const bookingPolicy = definePolicy(bookingTable, {
  cancel: (actor, booking) => booking.bookerId === actor.id,
});
```

```ts
// server/actions/booking/cancel-booking.action.ts
import { eq } from "drizzle-orm";
import { bookingTable } from "#nuxvel/schema";

const day = 24 * 60 * 60 * 1000;

export const cancelBookingAction = defineAction({
  input: bookingIdInput,
  errors: {
    "booking.too-late-to-cancel": "A booking can be cancelled until 24 hours before it starts",
  },
  handler: async (input, ctx, fail) => {
    const booking = await findOrFail(bookingTable, input.id);
    await authorize(ctx.actor, $policies.booking.cancel, booking);

    if (booking.startsAt.getTime() - now().getTime() < day) fail("booking.too-late-to-cancel");

    await useDb().delete(bookingTable).where(eq(bookingTable.id, booking.id));
  },
});
```

`authorize()` throws `ForbiddenError` when the rule returns `false`, and the client gets `FORBIDDEN`. Add the procedure to the router:

```ts
// server/trpc/routers/booking.router.ts
import { z } from "zod";
import { cancelBookingAction } from "#server/actions/booking/cancel-booking.action";
import { createBookingAction } from "#server/actions/booking/create-booking.action";

export const bookingRouter = {
  create: authedProcedure
    .input(createBookingInput)
    .output(bookingSchema)
    .mutation(({ input, ctx }) => createBookingAction(input, { actor: ctx.actor })),

  cancel: authedProcedure
    .input(bookingIdInput)
    .output(z.void())
    .mutation(({ input, ctx }) => cancelBookingAction(input, { actor: ctx.actor })),
};
```

```bash
./nv test tests/functional/bookings.test.ts
```

Every test of the file passes.

### Factory rows on the clock

The factory reads `now()`, so its rows follow the test clock too. Show it in the factory's own test:

```ts
// server/factories/booking.factory.test.ts
import { describe, it } from "vitest";
import { expect, expectRow, freezeTime } from "@nuxvel/nuxt/testing";
import { bookingTable } from "#nuxvel/schema";
import { bookingFactory } from "./booking.factory";

describe("booking factory", () => {
  it("inserts a new row on every call", async () => {
    const first = await bookingFactory();
    const second = await bookingFactory();

    expect(second).not.toEqual(first);
  });

  it("books one hour, one week from the app's now", async () => {
    const frozenAt = await freezeTime(new Date("2026-03-02T08:00:00Z"));

    const booking = await bookingFactory();

    expect(booking).toMatchObject({
      startsAt: new Date("2026-03-09T08:00:00Z"),
      endsAt: new Date("2026-03-09T09:00:00Z"),
    });
    await expectRow(bookingTable, { id: booking.id, createdAt: frozenAt });
  });
});
```

This test passes at once, because chapter 2 wrote the factory with `now()`. `createdAt` comes from `timestamps()`, which also reads `now()`. A factory runs in the test process, so a `new Date()` in it reads the real clock. Use `now()` in factories and in server code.

## 6. The confirmation mail

After a booking, the booker gets a mail with the room, the title and the start. The mail waits until the booking commits, so a refused booking sends nothing. A build for tests replaces the queue and the mail transport with fakes. The fakes record each job and each mail, and nothing reaches Redis or SMTP.

Add `expectMailSent`, `expectNoMailSent`, `expectNotQueued`, `expectQueued`, `renderMail` and `workQueue` to the import, and add a `describe`:

```ts
// tests/functional/bookings.test.ts
describe("the confirmation mail", () => {
  it("queues the confirmation once the booking is saved", async () => {
    const room = await roomFactory();

    const booking = await actingAs(await userFactory()).trpc.booking.create(sprintPlanning(room.id));

    await expectQueued("booking.send-confirmation", { bookingId: booking.id }, { times: 1 });
  });

  it("mails the booker when the queue runs", async () => {
    const ada = await userFactory();
    const room = await roomFactory({ name: "Lovelace" });
    await actingAs(ada).trpc.booking.create(sprintPlanning(room.id));

    await workQueue();

    const sent = await expectMailSent("booking.confirmed", { to: ada.email });
    const { subject } = await renderMail("booking.confirmed", sent);
    expect(subject).toBe("Lovelace is booked: Sprint planning");
  });

  it("sends nothing for a refused booking", async () => {
    const room = await smallRoomFactory();

    await expect(actingAs(await userFactory()).trpc.booking.create(sprintPlanning(room.id))).rejects.toBeActionError(
      "booking.over-capacity",
    );
    await workQueue();

    await expectNotQueued("booking.send-confirmation");
    await expectNoMailSent("booking.confirmed");
  });
});
```

- `expectQueued(name, match, { times: 1 })` passes when exactly one job with those payload fields reached the queue fake. It relays the outbox first.
- `workQueue()` runs every queued job until the queue is empty. It does not run the `nuxvel.mail` delivery job, so no mail leaves the test.
- `expectMailSent(name, match)` returns the input of the send. `renderMail` takes it as it is, so the test checks the subject of the mail that the job really sent.

```bash
./nv test tests/functional/bookings.test.ts -t "confirmation mail"
```

```
 FAIL  |functional| tests/functional/bookings.test.ts > the confirmation mail > queues the confirmation once the booking is saved
Error: expectQueued: expected a queued "booking.send-confirmation" job with {"bookingId":1} 1 times, found 0. Recorded: none

 FAIL  |functional| tests/functional/bookings.test.ts > the confirmation mail > mails the booker when the queue runs
Error: expectMailSent: expected a "booking.confirmed" mail with {"to":"ariel.leffler1617@example.com"}, found 0. Recorded: none
```

The third test passes already: nothing is queued yet. `-t` runs only the tests whose names match. Generate the job and the mail:

```bash
./nv make:job booking.send-confirmation booking_id:integer
./nv make:mail booking.confirmed
```

```ts
// server/mail/booking/confirmed.mail.ts
import { h } from "vue";
import { z } from "zod";
import BookingConfirmed from "./templates/BookingConfirmed.vue";

export const bookingConfirmedMail = defineMail({
  input: z.object({ to: z.email(), title: z.string(), room: z.string(), startsAt: z.date() }),
  subject: ({ room, title }) => `${room} is booked: ${title}`,
  render: (props) => h(BookingConfirmed, props),
});
```

```vue
<!-- server/mail/booking/templates/BookingConfirmed.vue -->
<script setup lang="ts">
defineProps<{ title: string; room: string; startsAt: Date }>();
</script>

<template>
  <MailLayout :preview="`${room} is booked`">
    <EHeading>{{ room }} is booked</EHeading>
    <EText>{{ title }} starts at {{ startsAt.toUTCString() }}.</EText>
  </MailLayout>
</template>
```

```ts
// server/jobs/booking/send-confirmation.job.ts
import { z } from "zod";
import { userTable, bookingTable, roomTable } from "#nuxvel/schema";

export const bookingSendConfirmationJob = defineJob({
  input: z.object({
    bookingId: z.number().int(),
  }),
  handler: async ({ bookingId }) => {
    const booking = await findOrFail(bookingTable, bookingId);
    const room = await findOrFail(roomTable, booking.roomId);
    const booker = await findOrFail(userTable, booking.bookerId);

    await sendMail("booking.confirmed", {
      to: booker.email,
      title: booking.title,
      room: room.name,
      startsAt: booking.startsAt,
    });
  },
});
```

Dispatch the job from the create action, after the insert:

```ts
// server/actions/booking/create-booking.action.ts
    const booking = await useDb()
      .insert(bookingTable)
      .values({ ...input, bookerId: ctx.actor.id })
      .returning()
      .then(firstOrFail);

    await dispatchAfterCommit("booking.send-confirmation", { bookingId: booking.id });

    return booking;
```

`dispatchAfterCommit` writes an outbox row in the transaction of the action. A `fail()` rolls the transaction back, so a refused booking queues nothing.

The two generated tests next to the job and the mail send the old input. Replace them. The job test runs the handler directly with `runJob`, without the queue:

```ts
// server/jobs/booking/send-confirmation.job.test.ts
import { expect, expectMailSent, runJob } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { bookingFactory, userFactory } from "#nuxvel/factories";

describe("booking.send-confirmation job", () => {
  it("mails the booker", async () => {
    const ada = await userFactory();
    const booking = await bookingFactory.for("bookerId", ada)();

    await runJob("booking.send-confirmation", { bookingId: booking.id });

    await expectMailSent("booking.confirmed", { to: ada.email, title: booking.title });
  });

  it("fails at once for a booking that is gone", async () => {
    await expect(runJob("booking.send-confirmation", { bookingId: 404 })).rejects.toBeUnrecoverable();
  });
});
```

`toBeUnrecoverable()` passes when the worker would fail the job at once, without a retry. A missing row does not come back on a retry. The mail test renders the template:

```ts
// server/mail/booking/confirmed.mail.test.ts
import { expect, renderMail } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";

describe("booking.confirmed mail", () => {
  it("names the room, the title and the start", async () => {
    const { subject, html, text } = await renderMail("booking.confirmed", {
      to: "ada@example.com",
      title: "Sprint planning",
      room: "Lovelace",
      startsAt: new Date("2030-01-07T09:00:00Z"),
    });

    expect(subject).toBe("Lovelace is booked: Sprint planning");
    expect(html).toContain(">Lovelace is booked</h1>");
    expect(text).toContain("Sprint planning starts at Mon, 07 Jan 2030 09:00:00 GMT.");
  });
});
```

```bash
./nv test tests/functional/bookings.test.ts server/jobs server/mail
```

The three files pass.

## 7. The booking list and an N+1 query

The list page shows each booking with its room and its booker, and a search by title. Write the test of the result and two tests of the query count in a new file:

```ts
// tests/functional/booking-list.test.ts
import { actingAs, expect, expectConstantQueries, expectQueryCount } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { bookingFactory, roomFactory, userFactory } from "#nuxvel/factories";

describe("the booking list", () => {
  it("finds bookings by title, with the room and the booker", async () => {
    const ada = await userFactory({ name: "Ada Lovelace" });
    const room = await roomFactory({ name: "Hopper" });
    await bookingFactory.for("roomId", room).for("bookerId", ada)({ title: "Sprint planning" });
    await bookingFactory({ title: "Board meeting" });

    const rows = await actingAs(ada).trpc.booking.list({ q: "sprint" });

    expect(rows).toEqual([expect.objectContaining({ title: "Sprint planning", room: "Hopper", booker: "Ada Lovelace" })]);
  });

  it("runs the same queries for 1 booking and for 4", async () => {
    const viewer = await userFactory();

    await expectConstantQueries(async (size) => {
      await bookingFactory.count(size)();
      await actingAs(viewer).trpc.booking.list({});
    });
  });

  it("loads the list in 2 queries, the session user included", async () => {
    const viewer = await userFactory();
    await bookingFactory.count(3)();

    await expectQueryCount({ max: 2 }, () => actingAs(viewer).trpc.booking.list({}));
  });
});
```

- `expectConstantQueries(fn)` calls `fn(1)`, then `fn(4)`. It counts the queries that the app runs for the calls in `fn`, and fails when the counts differ. It does not count the factory inserts. The rows of the first call stay, so the second call lists 5 bookings.
- `expectQueryCount({ max: 2 }, fn)` holds the call to a budget. The count includes the query that loads the session user of `actingAs`.

Add the input and the output shape of the list to the shared schema:

```ts
// shared/schemas/booking.ts
export const bookingListInput = z.object({
  q: z.string().trim().optional(),
});

export const bookingListItemSchema = bookingSchema
  .pick({ id: true, title: true, startsAt: true, endsAt: true, guests: true })
  .extend({ room: z.string(), booker: z.string() });
```

The first version of the list is the one that many apps write first. It loads the bookings, then the room and the booker of each one:

```ts
// server/trpc/routers/booking.router.ts
  list: authedProcedure
    .input(bookingListInput)
    .output(z.array(bookingListItemSchema))
    .query(async ({ input }) => {
      const bookings = await useDb()
        .select()
        .from(bookingTable)
        .where(input.q ? ilike(bookingTable.title, `%${input.q}%`) : undefined)
        .orderBy(bookingTable.startsAt);

      return Promise.all(
        bookings.map(async (booking) => ({
          ...booking,
          room: (await findOrFail(roomTable, booking.roomId)).name,
          booker: (await findOrFail(userTable, booking.bookerId)).name,
        })),
      );
    }),
```

Import `ilike` from `drizzle-orm`, and `userTable`, `bookingTable` and `roomTable` from their schema files.

```bash
./nv test tests/functional/booking-list.test.ts
```

```
 FAIL  |functional| tests/functional/booking-list.test.ts > the booking list > runs the same queries for 1 booking and for 4
Error: expectConstantQueries: query count varies with input size (size 1: 4 queries, size 4: 12 queries)
Queries only at size 4:
  4x select "id", "name", "email", "email_verified", "image", "role", "locale", "two_factor_enabled", "created_at", "updated_at" from "user" where "user"."id" = $1
  4x select "id", "name", "capacity", "created_at", "updated_at" from "room" where "room"."id" = $1

 FAIL  |functional| tests/functional/booking-list.test.ts > the booking list > loads the list in 2 queries, the session user included
Error: expectQueryCount: the app ran 8 queries, over the budget of 2
```

The result is correct, so the first test passes. The count tests show the N+1: one query for the room and one for the booker of each booking. Load them in one query with joins:

```ts
// server/trpc/routers/booking.router.ts
  list: authedProcedure
    .input(bookingListInput)
    .output(z.array(bookingListItemSchema))
    .query(({ input }) =>
      useDb()
        .select({
          id: bookingTable.id,
          title: bookingTable.title,
          startsAt: bookingTable.startsAt,
          endsAt: bookingTable.endsAt,
          guests: bookingTable.guests,
          room: roomTable.name,
          booker: userTable.name,
        })
        .from(bookingTable)
        .innerJoin(roomTable, eq(roomTable.id, bookingTable.roomId))
        .innerJoin(userTable, eq(userTable.id, bookingTable.bookerId))
        .where(input.q ? ilike(bookingTable.title, `%${input.q}%`) : undefined)
        .orderBy(bookingTable.startsAt),
    ),
```

```bash
./nv test tests/functional/booking-list.test.ts
```

```
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

### One booking and the rooms

The pages of chapter 9 also need one booking by its ID, and the rooms for the form. Add the tests to the same file:

```ts
// tests/functional/booking-list.test.ts
describe("one booking", () => {
  it("shows a booking with its room and booker", async () => {
    const ada = await userFactory({ name: "Ada Lovelace" });
    const booking = await bookingFactory.for("bookerId", ada)({ title: "Sprint planning" });

    const shown = await actingAs(ada).trpc.booking.byId({ id: booking.id });

    expect(shown).toMatchObject({ id: booking.id, title: "Sprint planning", booker: "Ada Lovelace" });
  });

  it("answers NOT_FOUND for a booking that does not exist", async () => {
    await expect(actingAs(await userFactory()).trpc.booking.byId({ id: 404 })).rejects.toBeTrpcError("NOT_FOUND");
  });
});

describe("the rooms", () => {
  it("lists the rooms by name", async () => {
    await roomFactory({ name: "Turing", capacity: 12 });
    await roomFactory({ name: "Hopper", capacity: 4 });

    const rooms = await actingAs(await userFactory()).trpc.room.list();

    expect(rooms).toEqual([
      expect.objectContaining({ name: "Hopper", capacity: 4 }),
      expect.objectContaining({ name: "Turing", capacity: 12 }),
    ]);
  });
});
```

```
     × shows a booking with its room and booker
     × lists the rooms by name
TRPCError: No procedure found on path "booking,byId"
TRPCError: No procedure found on path "room,list"
```

The `NOT_FOUND` test passes before `byId` exists, because tRPC answers a missing procedure with `NOT_FOUND` too. Only `npm run typecheck` shows that this test calls nothing. Run the typecheck next to the tests for this reason.

Move the select of the list into a function, so that `byId` uses the same columns and joins:

```ts
// server/trpc/routers/booking.router.ts
import { eq, ilike } from "drizzle-orm";
import { z } from "zod";
import { cancelBookingAction } from "#server/actions/booking/cancel-booking.action";
import { createBookingAction } from "#server/actions/booking/create-booking.action";
import { userTable, bookingTable, roomTable } from "#nuxvel/schema";

function bookingRows() {
  return useDb()
    .select({
      id: bookingTable.id,
      title: bookingTable.title,
      startsAt: bookingTable.startsAt,
      endsAt: bookingTable.endsAt,
      guests: bookingTable.guests,
      room: roomTable.name,
      booker: userTable.name,
    })
    .from(bookingTable)
    .innerJoin(roomTable, eq(roomTable.id, bookingTable.roomId))
    .innerJoin(userTable, eq(userTable.id, bookingTable.bookerId))
    .$dynamic();
}

export const bookingRouter = {
  list: authedProcedure
    .input(bookingListInput)
    .output(z.array(bookingListItemSchema))
    .query(({ input }) =>
      bookingRows()
        .where(input.q ? ilike(bookingTable.title, `%${input.q}%`) : undefined)
        .orderBy(bookingTable.startsAt),
    ),

  byId: authedProcedure
    .input(bookingIdInput)
    .output(bookingListItemSchema)
    .query(async ({ input }) => {
      const [booking] = await bookingRows().where(eq(bookingTable.id, input.id));
      if (!booking) throw new NotFoundError("No such booking");
      return booking;
    }),

  create: authedProcedure
    .input(createBookingInput)
    .output(bookingSchema)
    .mutation(({ input, ctx }) => createBookingAction(input, { actor: ctx.actor })),

  cancel: authedProcedure
    .input(bookingIdInput)
    .output(z.void())
    .mutation(({ input, ctx }) => cancelBookingAction(input, { actor: ctx.actor })),
};
```

```bash
./nv make:router room
```

```ts
// server/trpc/routers/room.router.ts
import { z } from "zod";
import { roomTable } from "#nuxvel/schema";

export const roomRouter = {
  list: authedProcedure
    .output(z.array(roomSchema.pick({ id: true, name: true, capacity: true })))
    .query(() => useDb().select().from(roomTable).orderBy(roomTable.name)),
};
```

```bash
./nv test tests/functional
```

```
 Test Files  4 passed (4)
      Tests  32 passed (32)
```

The server code is complete. Each rule, the mail, the clock and the query count have a functional test. The next two chapters test what only a browser can show.

## 8. Component tests

One journey in a browser shows only some states of a component. A form can save, the schema can stop it, or the server can refuse it. A story is one state of one component, and its `play` function checks that state. `npm run test:ui` runs each story in a headless Chromium. MSW answers the tRPC calls in the browser, so a story needs no server and no database.

The helpers of `@nuxvel/nuxt/storybook/test` have the names and the arguments of the end-to-end helpers, so a `play` function reads like an end-to-end test. `page` is the document of the story.

### The booking form

Write the stories before the component:

```ts
// app/components/BookingForm.stories.ts
import type { Meta, StoryObj } from "@storybook-vue/nuxt";
import { ActionError, mockTrpc, TRPCError, trpcSpy } from "@nuxvel/nuxt/storybook/mocks";
import { button, expect, field, fillForm, page, text } from "@nuxvel/nuxt/storybook/test";
import BookingForm from "./BookingForm.vue";

const rooms = [
  { id: 1, name: "Hopper", capacity: 4 },
  { id: 2, name: "Turing", capacity: 12 },
];

const create = trpcSpy("booking.create", (input) => ({
  ...input,
  id: 7,
  bookerId: "user-1",
  createdAt: new Date(),
  updatedAt: new Date(),
}));

const meta = { component: BookingForm, args: { rooms } } satisfies Meta<typeof BookingForm>;
export default meta;

export const Books: StoryObj<typeof meta> = {
  parameters: { msw: [mockTrpc({ booking: { create } })] },
  play: async () => {
    await fillForm(page, {
      Title: "Sprint planning",
      Room: "Turing",
      Starts: "2030-01-07T09:00",
      Ends: "2030-01-07T10:00",
      Guests: "6",
    });
    await button(page, "Book the room").click();

    await expect(create).toHaveBeenCalledWith({
      title: "Sprint planning",
      roomId: 2,
      startsAt: new Date("2030-01-07T09:00"),
      endsAt: new Date("2030-01-07T10:00"),
      guests: 6,
    });
    await expect(create).toHaveBeenCalledTimes(1);
  },
};

export const ChecksTheTimesFirst: StoryObj<typeof meta> = {
  parameters: { msw: [mockTrpc({ booking: { create } })] },
  play: async () => {
    await fillForm(page, {
      Title: "Sprint planning",
      Room: "Hopper",
      Starts: "2030-01-07T10:00",
      Ends: "2030-01-07T09:00",
    });
    await button(page, "Book the room").click();

    await expect(text(page, "End the booking after it starts")).toBeVisible();
    await expect(field(page, "Ends")).toHaveAttribute("aria-invalid", "true");
    await expect(create).not.toHaveBeenCalled();
  },
};

export const RoomTooSmall: StoryObj<typeof meta> = {
  parameters: {
    msw: [
      mockTrpc({
        booking: {
          create: () => {
            throw new ActionError("booking.over-capacity", "Hopper holds 4 people");
          },
        },
      }),
    ],
  },
  play: async () => {
    await fillForm(page, {
      Title: "All hands",
      Room: "Hopper",
      Starts: "2030-01-07T09:00",
      Ends: "2030-01-07T10:00",
      Guests: "9",
    });
    await button(page, "Book the room").click();

    await expect(text(page, "Hopper holds 4 people")).toBeVisible();
    await expect(field(page, "Guests")).toHaveAttribute("aria-invalid", "true");
  },
};

export const SignedOut: StoryObj<typeof meta> = {
  parameters: {
    msw: [
      mockTrpc({
        booking: {
          create: () => {
            throw new TRPCError({ code: "UNAUTHORIZED", message: "Sign in to book a room" });
          },
        },
      }),
    ],
  },
  play: async () => {
    await fillForm(page, { Title: "All hands", Room: "Hopper", Starts: "2030-01-07T09:00", Ends: "2030-01-07T10:00" });
    await button(page, "Book the room").click();

    await expect(text(page, "Sign in to book a room")).toBeVisible();
  },
};
```

- `trpcSpy(path, implementation)` answers like `implementation` and records each call. TypeScript checks the path, the input and the output against the router.
- `fillForm(page, { Label: value })` fills each field by its label: a text input, a `USelect` by the label of an option, a `datetime-local` input and a `UInputNumber`.
- `expect(spy).toHaveBeenCalledWith(input)` tries again until the call arrives, because the call goes through MSW. `.not.toHaveBeenCalled()` shows that the schema stopped the submit in the browser.
- An `ActionError(code, message)` from the mock reaches the component as the server sends it, with `data.actionCode`. A `TRPCError` keeps its code and its message.
- The four stories are the four states of the form. Each one is one test.

```bash
npm run test:ui
```

```
[error] Internal server error: Failed to resolve import "./BookingForm.vue" from "app/components/BookingForm.stories.ts". Does the file exist?
```

While one story file cannot load, the stories of the starter fail too, with an accessibility error on the Vite error overlay. Write the component:

```vue
<!-- app/components/BookingForm.vue -->
<script setup lang="ts">
const props = defineProps<{ rooms: { id: number; name: string; capacity: number }[] }>();

const queryCache = useQueryCache();

const form = useActionForm(createBookingInput, toasted($api.booking.create.mutationOptions(), "Room booked"), {
  defaults: { title: "", roomId: undefined, startsAt: undefined, endsAt: undefined, guests: 1 },
  failures: {
    "booking.over-capacity": "guests",
    "booking.overlap": "startsAt",
    "booking.in-the-past": "startsAt",
  },
  onSuccess: async () => {
    await queryCache.invalidateQueries({ key: $api.booking.key() });
    await navigateTo({ name: "bookings" });
  },
});

const roomItems = computed(() => props.rooms.map((room) => ({ label: room.name, value: room.id })));

function localTime(date: Date | undefined) {
  return date ? new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : "";
}
</script>

<template>
  <UForm :ref="form.ref" :schema="form.schema" :state="form.state" class="space-y-4" @submit="form.submit">
    <UFormField name="title" label="Title">
      <UInput v-model="form.state.title" class="w-full" />
    </UFormField>
    <UFormField name="roomId" label="Room">
      <USelect v-model="form.state.roomId" :items="roomItems" class="w-full" />
    </UFormField>
    <UFormField name="startsAt" label="Starts">
      <UInput
        type="datetime-local"
        :model-value="localTime(form.state.startsAt)"
        class="w-full"
        @update:model-value="form.state.startsAt = new Date($event)"
      />
    </UFormField>
    <UFormField name="endsAt" label="Ends">
      <UInput
        type="datetime-local"
        :model-value="localTime(form.state.endsAt)"
        class="w-full"
        @update:model-value="form.state.endsAt = new Date($event)"
      />
    </UFormField>
    <UFormField name="guests" label="Guests">
      <UInputNumber v-model="form.state.guests" :min="1" class="w-full" />
    </UFormField>
    <UAlert v-if="form.formError" color="error" :title="form.formError" />
    <UButton type="submit" :loading="form.pending" label="Book the room" />
  </UForm>
</template>
```

- `useActionForm` checks the state with `createBookingInput` in the browser first, so the schema messages of chapter 4 show here with no more code.
- `failures` puts the message of each action failure under its field. A failure that is not in the map, such as `UNAUTHORIZED`, goes to `form.formError`.
- A `datetime-local` input holds a local time string, and the schema takes a `Date`. `localTime` converts the `Date` for the input, and `new Date($event)` converts it back.

```bash
npm run test:ui
```

```
 Test Files  3 passed (3)
      Tests  8 passed (8)
```

### The booking item and the accessibility check

Each row of the list has a cancel button with an icon and a tooltip. Write its stories first:

```ts
// app/components/BookingItem.stories.ts
import type { Meta, StoryObj } from "@storybook-vue/nuxt";
import { ActionError, mockTrpc, trpcSpy } from "@nuxvel/nuxt/storybook/mocks";
import { button, expect, page, text } from "@nuxvel/nuxt/storybook/test";
import BookingItem from "./BookingItem.vue";

const booking = {
  id: 7,
  title: "Sprint planning",
  room: "Hopper",
  booker: "Ada Lovelace",
  startsAt: new Date("2030-01-07T09:00:00Z"),
  endsAt: new Date("2030-01-07T10:00:00Z"),
  guests: 4,
};

const cancel = trpcSpy("booking.cancel", () => undefined);

const meta = { component: BookingItem, args: { booking } } satisfies Meta<typeof BookingItem>;
export default meta;

export const Default: StoryObj<typeof meta> = {};

export const ExplainsTheCancelButton: StoryObj<typeof meta> = {
  play: async () => {
    await button(page, "Cancel Sprint planning").hover();
    await expect(text(page, "Cancels the booking and frees the room")).toBeVisible();

    await button(page, "Cancel Sprint planning").unhover();
    await expect(text(page, "Cancels the booking and frees the room")).toHaveCount(0);
  },
};

export const Cancels: StoryObj<typeof meta> = {
  parameters: { msw: [mockTrpc({ booking: { cancel } })] },
  play: async () => {
    await button(page, "Cancel Sprint planning").click();

    await expect(cancel).toHaveBeenCalledWith({ id: 7 });
  },
};

export const TooLateToCancel: StoryObj<typeof meta> = {
  parameters: {
    msw: [
      mockTrpc({
        booking: {
          cancel: () => {
            throw new ActionError("booking.too-late-to-cancel", "A booking can be cancelled until 24 hours before it starts");
          },
        },
      }),
    ],
  },
  play: async () => {
    await button(page, "Cancel Sprint planning").click();

    await expect(text(page, "A booking can be cancelled until 24 hours before it starts")).toBeVisible();
  },
};
```

A story component test has no fake timers. `hover()` and `unhover()` wait for the real tooltip delay, and `expect` tries again until the text shows or goes. A Nuxt UI tooltip renders its text two times, and `text()` skips the copy with `aria-hidden="true"`. `Default` has no `play` function. It still runs, and the accessibility check below applies to it.

A first version of the component, as an icon button often starts:

```vue
<!-- app/components/BookingItem.vue -->
<script setup lang="ts">
const props = defineProps<{ booking: { id: number; title: string; room: string; booker: string; startsAt: Date } }>();

const queryCache = useQueryCache();

const cancel = useMutation(
  toasted(
    {
      ...$api.booking.cancel.mutationOptions(),
      onSuccess: () => queryCache.invalidateQueries({ key: $api.booking.key() }),
    },
    "Booking cancelled",
  ),
);
</script>

<template>
  <li class="flex items-center justify-between gap-4 py-3">
    <div class="space-y-1">
      <ULink :to="{ name: 'bookings-id', params: { id: booking.id } }" class="font-medium">{{ booking.title }}</ULink>
      <p class="text-sm text-muted">{{ booking.room }} · {{ booking.booker }} · <DateTime :value="booking.startsAt" /></p>
      <p v-if="cancel.error.value" role="alert" class="text-sm text-error">{{ cancel.error.value.message }}</p>
    </div>
    <UTooltip text="Cancels the booking and frees the room">
      <UButton
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        :loading="cancel.isLoading.value"
        @click="cancel.mutate({ id: props.booking.id })"
      />
    </UTooltip>
  </li>
</template>
```

```bash
npx nuxvel test:ui app/components/BookingItem.stories.ts
```

```
 FAIL  |ui (chromium)| app/components/BookingItem.stories.ts > Explains The Cancel Button
locator.hover: Timeout 5000ms exceeded.
waiting for page.getByRole("button", { name: "Cancel Sprint planning" })
  - no element matches
```

The helpers find an element by its role and its accessible name, as a screen reader does. The button has an icon and no name, so `button(page, "Cancel Sprint planning")` finds nothing. The `Default` story fails too, with no line of test code:

```
 FAIL  |ui (chromium)| app/components/BookingItem.stories.ts > Default
Expected the HTML found at $('.rounded-md') to have no violations:
Received:
"Buttons must have discernible text (button-name)"

Expected the HTML found at $('.justify-between') to have no violations:
Received:
"<li> elements must be contained in a <ul> or <ol> (listitem)"
```

`@storybook/addon-a11y` runs axe after each story, with the WCAG 2.1 AA rules of [`expectAccessible`](../testing.md#accessibility). A violation fails the story. The tooltip does not name the button: it describes it. The second violation is real too: the `<li>` belongs to the list of the page, not to the item.

Give the button a name, and make the root a `<div>`:

```vue
<!-- app/components/BookingItem.vue -->
<template>
  <div class="flex items-center justify-between gap-4 py-3">
    <div class="space-y-1">
      <ULink :to="{ name: 'bookings-id', params: { id: booking.id } }" class="font-medium">{{ booking.title }}</ULink>
      <p class="text-sm text-muted">{{ booking.room }} · {{ booking.booker }} · <DateTime :value="booking.startsAt" /></p>
      <p v-if="cancel.error.value" role="alert" class="text-sm text-error">{{ cancel.error.value.message }}</p>
    </div>
    <UTooltip text="Cancels the booking and frees the room">
      <UButton
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        :aria-label="`Cancel ${booking.title}`"
        :loading="cancel.isLoading.value"
        @click="cancel.mutate({ id: props.booking.id })"
      />
    </UTooltip>
  </div>
</template>
```

```bash
npx nuxvel test:ui app/components/BookingItem.stories.ts
```

```
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

A failed story prints a link such as `http://localhost:6006/?path=/story/components-bookingitem--default&addonPanel=storybook/interactions/panel`. Start Storybook with `npm run storybook` and open the link to see each step of the `play` function. See [Storybook: play functions](../storybook.md#play-functions).

## 9. End-to-end tests

The stories checked each state with a fake server. An end-to-end test checks the journeys with the real server, a real session and the real browser timers. Write the tests before the pages:

```ts
// tests/e2e/bookings.test.ts
import {
  actingAs,
  button,
  expect,
  expectAccessible,
  expectNoRow,
  field,
  fillForm,
  heading,
  link,
  text,
  toast,
  trpcSpy,
} from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { bookingTable } from "#nuxvel/schema";
import { bookingFactory, roomFactory, userFactory } from "#nuxvel/factories";

describe("the booking pages", () => {
  it("books a room from the form and lists it", async () => {
    await roomFactory({ name: "Hopper", capacity: 4 });

    const page = await actingAs(await userFactory()).visit({ name: "bookings-new" });
    await expectAccessible(page);

    await fillForm(page, {
      Title: "Sprint planning",
      Room: "Hopper",
      Starts: "2030-01-07T09:00",
      Ends: "2030-01-07T10:00",
      Guests: "3",
    });
    await button(page, "Book the room").click();

    await expect(page).toHaveURL(/\/bookings$/);
    await expect(link(page, "Sprint planning")).toBeVisible();
    await toast(page, "Room booked").dismiss();
    await expectAccessible(page);
  });

  it("opens a booking by its route name", async () => {
    const booking = await bookingFactory({ title: "Board meeting" });

    const page = await actingAs(await userFactory()).visit({ name: "bookings-id", params: { id: booking.id } });

    await expect(heading(page, "Board meeting")).toBeVisible();
    await expectAccessible(page);
  });

  it("answers 404 for a booking that does not exist", async () => {
    const page = await actingAs(await userFactory()).visit("/bookings/404", { status: 404 });

    await expect(text(page, "No such booking")).toBeVisible();
  });

  it("searches 300 ms after the last key", async () => {
    await bookingFactory({ title: "Sprint planning" });
    await bookingFactory({ title: "Board meeting" });

    const page = await actingAs(await userFactory()).visit({ name: "bookings" }, { clock: true });
    const list = trpcSpy(page, "booking.list");

    await field(page, "Search bookings").pressSequentially("sprint");
    await page.clock.runFor(299);
    await expect(list).not.toHaveBeenCalled();

    await page.clock.runFor(1);
    await expect(list).toHaveBeenCalledWith({ q: "sprint" });
    await expect(list).toHaveBeenCalledTimes(1);
    await expect(link(page, "Board meeting")).toBeHidden();
    await expect(link(page, "Sprint planning")).toBeVisible();
  });

  it("explains the cancel button on hover", async () => {
    await bookingFactory({ title: "Sprint planning" });

    const page = await actingAs(await userFactory()).visit({ name: "bookings" }, { clock: true });

    await button(page, "Cancel Sprint planning").hover();
    await page.clock.runFor(1000);
    await expect(text(page, "Cancels the booking and frees the room")).toBeVisible();

    await page.mouse.move(0, 0);
    await page.clock.runFor(1000);
    await expect(text(page, "Cancels the booking and frees the room")).toHaveCount(0);
  });

  it("cancels the booker's own booking", async () => {
    const ada = await userFactory();
    const booking = await bookingFactory.for("bookerId", ada)({ title: "Sprint planning" });

    const page = await actingAs(ada).visit({ name: "bookings" });
    await button(page, "Cancel Sprint planning").click();

    await expect(toast(page, "Booking cancelled")).toBeVisible();
    await expect(link(page, "Sprint planning")).toBeHidden();
    await expectNoRow(bookingTable, { id: booking.id });
  });
});
```

- `actingAs(user).visit(target)` signs the user in with a real session cookie, opens the page and waits for hydration. `visit` fails the test on a page error, a `console.error`, a failed request and a response of 500 or more. When a test fails, it saves a screenshot to `test-results/`.
- `target` is a path or a route location, such as `{ name: "bookings-id", params: { id } }`. A route name stays the same when the URL changes.
- `{ status: 404 }` tells `visit` that the page must answer 404, so it does not record that response as an error.
- `{ clock: true }` installs the Playwright clock and pauses it before the page loads. `<SearchInput>` waits 300 ms after the last key. After `pressSequentially`, the test moves the clock 299 ms and checks that no call went out. 1 more ms sends the search. The test makes no real wait.
- `trpcSpy(page, path)` records the calls of the page to the procedure, and the real server answers them. It records only the calls after `trpcSpy`, so the list query of the server render does not count.
- Playwright has no `unhover()`. `page.mouse.move(0, 0)` moves the mouse away from the button.
- `expectAccessible(page)` runs the same axe rules as the stories, on the whole page. Call it after each page load and after a large change, here when the toast is gone.
- `expectNoRow` works in an end-to-end test too, because the test and the server share the test database.

```bash
npm run test:e2e -- tests/e2e/bookings.test.ts
```

```
     × books a room from the form and lists it
     × opens a booking by its route name
     × answers 404 for a booking that does not exist
     × searches 300 ms after the last key
     × explains the cancel button on hover
     × cancels the booker's own booking

 FAIL  |e2e| tests/e2e/bookings.test.ts > the booking pages > opens a booking by its route name
Error: page.evaluate: Error
```

The pages do not exist, so the router of the app cannot resolve the route names. The message does not say this yet: it is only `page.evaluate: Error`. Write the three pages:

```vue
<!-- app/pages/bookings/index.vue -->
<script setup lang="ts">
definePageMeta({ layout: "app", middleware: "auth" });

const q = ref("");
const bookings = $api.booking.list.useQuery(() => ({ q: q.value }));

useSeo({ title: "Bookings" });
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between gap-4">
      <h1 class="text-2xl font-semibold">Bookings</h1>
      <UButton :to="{ name: 'bookings-new' }" icon="i-lucide-plus" label="Book a room" />
    </div>
    <SearchInput v-model="q" aria-label="Search bookings" placeholder="Search bookings" />
    <QueryState :query="bookings">
      <template #empty>
        <UEmpty icon="i-lucide-calendar" title="No bookings found" />
      </template>
      <template #default="{ data }">
        <ul class="divide-y divide-default">
          <li v-for="booking in data" :key="booking.id">
            <BookingItem :booking="booking" />
          </li>
        </ul>
      </template>
    </QueryState>
  </div>
</template>
```

```vue
<!-- app/pages/bookings/new.vue -->
<script setup lang="ts">
definePageMeta({ layout: "app", middleware: "auth" });

const rooms = $api.room.list.useQuery();

useSeo({ title: "Book a room" });
</script>

<template>
  <div class="max-w-xl space-y-6">
    <h1 class="text-2xl font-semibold">Book a room</h1>
    <QueryState :query="rooms">
      <template #default="{ data }">
        <BookingForm :rooms="data" />
      </template>
    </QueryState>
  </div>
</template>
```

```vue
<!-- app/pages/bookings/[id].vue -->
<script setup lang="ts">
definePageMeta({ layout: "app", middleware: "auth" });

const route = useRoute("bookings-id");
const booking = $api.booking.byId.useQuery({ id: Number(route.params.id) });

useSeo(() => ({ title: booking.data?.title ?? "Booking" }));
</script>

<template>
  <QueryState :query="booking">
    <template #default="{ data }">
      <div class="space-y-2">
        <h1 class="text-2xl font-semibold">{{ data.title }}</h1>
        <p class="text-muted">{{ data.room }} · {{ data.guests }} guests · booked by {{ data.booker }}</p>
        <p><DateTime :value="data.startsAt" /> to <DateTime :value="data.endsAt" /></p>
        <ULink :to="{ name: 'bookings' }">All bookings</ULink>
      </div>
    </template>
  </QueryState>
</template>
```

When `byId` fails with `NOT_FOUND` during the server render, `<QueryState>` renders its error slot with the message `No such booking`, and the page answers 404. Run `npx nuxt prepare` to write the route names of the new pages for the typecheck. The dev server does this for you.

```bash
npm run test:e2e
```

```
 Test Files  2 passed (2)
      Tests  10 passed (10)
```

The starter's `tests/e2e/home.test.ts` calls `expectNoSmoke()`. It opens each page without params, so it now also checks `/bookings` and `/bookings/new` for errors and accessibility violations.

## 10. Architecture rules

`npm run test:arch` checks the shape of the code, with no test run. Five of its rules are about tests. A test imports `expect` from the nuxvel entry of its layer. A functional test does not read the HTML of a page. A test with other data uses `it.for`. A test gets its user from a factory. A test reaches the app with `guest()`, `actingAs()` and `visit()`. See [CLI: nuxvel test:arch](../cli.md#nuxvel-testarch).

Suppose a quick test checks the heading of the list page:

```ts
// tests/functional/bookings-page.test.ts
import { guest } from "@nuxvel/nuxt/testing";
import { describe, expect, it } from "vitest";

describe("the bookings page", () => {
  it("shows the heading", async () => {
    const html = await guest().$fetch<string>("/bookings");

    expect(html).toContain("Bookings");
  });
});
```

```bash
npm run test:arch
```

```
✖ tests/functional/bookings-page.test.ts: 'expect' import from 'vitest' is restricted. Import expect from @nuxvel/nuxt/testing in a test, or from @nuxvel/nuxt/storybook/test in a story.
✖ tests/functional/bookings-page.test.ts: guest().$fetch reads the HTML of a page in a functional test: check what the page shows in a story play function (nuxvel test:ui) or with visit() (nuxvel test:e2e), and keep the status, redirect and data checks here
✖ 2 architecture violations
```

What a page shows belongs to a story or to `visit()`, and chapter 9 already checks the list page. Delete the file:

```bash
rm tests/functional/bookings-page.test.ts
npm run test:arch
```

```
✔ All architecture rules pass
```

The other rules check the app code, for example that a router writes only through actions and that each query has an `.output()`. See [CLI: test:arch](../cli.md#nuxvel-testarch).

## 11. Fast feedback

The whole suite is small now, but it grows with the app. While you work, run only the test files that your change can affect:

```bash
./nv test --changes-only
```

```
◇ Run all test files: there is no record of a previous run
 Test Files  8 passed (8)
      Tests  38 passed (38)
```

The first run runs every file. For each test file, it records the app files that the file ran in the server and in the test process. The next run hashes the project files and runs only the files that a change can affect:

```bash
./nv test --changes-only
```

```
◇ Test files replayed as passed: 8. Test files to run: 0.
```

Change the cancel action, for example `const day = 24 * 60 * 60_000;`, and run it again:

```
◇ Test files replayed as passed: 7. Test files to run: 1.
◇ Using the test build from 03/10/2026, 12:43:01 am
 ✓ |functional| tests/functional/bookings.test.ts (21 tests) 4029ms
```

Only `bookings.test.ts` ran the cancel action, so only that file runs. The setup keeps the two newest test builds, and this source matches one of them, so the run does not build again. A change to `nuxt.config.ts`, `package.json`, a migration or a file in `tests/setup/` runs every file. So does a change to a file that no test ran.

To run the affected tests on each save, use watch mode:

```bash
./nv test --watch
```

```
◇ Test files replayed as passed: 8. Test files to run: 0.
◇ Wait for file changes. Push Ctrl-C to stop.
```

Change the subject of the mail to `` `${room} is booked: ${title}!` `` and save. The watch selects the three files that ran the mail, and the two that check the subject fail:

```
◇ Test files replayed as passed: 5. Test files to run: 3.
◇ Built the app for tests: server/mail/booking/confirmed.mail.ts changed (18.8s)
 ❯ |functional| server/mail/booking/confirmed.mail.test.ts (1 test | 1 failed)
 ❯ |functional| tests/functional/bookings.test.ts (21 tests | 1 failed)
 ✓ |functional| server/jobs/booking/send-confirmation.job.test.ts (2 tests)
AssertionError: expected 'Lovelace is booked: Sprint planning!' to be 'Lovelace is booked: Sprint planning' // Object.is equality
```

Put the subject back and save. The watch runs the same three files again, and they pass. Push Ctrl-C to stop the watch. `--changes-only` and `--watch` select functional tests only. Run the full suite before you merge, and CI always runs every file:

```bash
npm test
npm run test:e2e
npm run test:arch
npm run typecheck
```

```
 Test Files  8 passed (8)
      Tests  38 passed (38)

 Test Files  4 passed (4)
      Tests  12 passed (12)

 Test Files  2 passed (2)
      Tests  10 passed (10)

✔ All architecture rules pass
```

See [Testing: run only the changed tests](../testing.md#run-only-the-changed-tests) for the rules of the selection and the cases that it misses.

## Where each check went

| Check | Layer | Helper |
|---|---|---|
| A booking saves for the signed-in user | functional | `actingAs().trpc`, `expectRow` |
| A guest cannot book or cancel | functional | `guest().trpc`, `toBeTrpcError` |
| The real sign-in session works | functional | `signIn`, `withPassword` |
| Each schema rule and its message | functional | `describe.for`, `it.for`, `toHaveValidationErrors` |
| Each action rule | functional | `it.for` with lazy factories, a state, a scenario, `toBeActionError` |
| The past and the 24-hour rules | functional | `freezeTime`, `travelBy`, `expectNoRow` |
| The confirmation mail | functional | `expectQueued`, `workQueue`, `expectMailSent`, `renderMail`, `runJob` |
| No N+1 in the list | functional | `expectConstantQueries`, `expectQueryCount` |
| What the form sends and each message it shows | component | `fillForm`, `trpcSpy`, `ActionError`, `TRPCError` |
| The tooltip and the name of the cancel button | component | `hover`, `unhover`, the axe check of each story |
| Book, find and cancel in the real app | end-to-end | `visit`, `{ clock: true }`, `trpcSpy(page, path)`, `expectAccessible` |
| A test in the wrong layer | architecture | `npm run test:arch` |

## See also

- [Testing](../testing.md)
- [Storybook](../storybook.md)
- [Validation](../validation.md)
- [Actions](../actions.md)
- [API (tRPC)](../api.md)
