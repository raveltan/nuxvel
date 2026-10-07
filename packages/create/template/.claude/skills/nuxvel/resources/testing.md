# Testing

One check, one layer. No unit-test layer.

| Layer | Checks | Place | Run |
|---|---|---|---|
| Functional | procedure result/error, rows, jobs, mail, status, `location`, `getMeta()`. Never page HTML | `tests/functional/`, `*.test.ts` next to a `server/` file | `./nv test:functional` |
| Component | states of one component, `mockTrpc`, `mockUser`, `trpcSpy` | `*.stories.ts` next to the component | `./nv test:ui` |
| End-to-end | a journey across pages, real session | `tests/e2e/` | `./nv test:e2e` |

`expect`: functional + e2e from `@nuxvel/nuxt/testing`. Story from `@nuxvel/nuxt/storybook/test`. Never from `vitest`. `describe` and `it` come from there too. `vi` comes from `vitest`.

## Functional

```ts
import { actingAs, describe, expect, expectRow, guest, it, runAction } from "@nuxvel/nuxt/testing";
import { postTable } from "../../server/database/schema/post.schema";
import { userFactory } from "../../server/factories/users.factory";

describe("post router", () => {
  it("creates a post", async () => {
    const { api } = actingAs(await userFactory());
    const post = await api.post.create({ title: "Hello", body: "" });
    await expectRow(postTable, { id: post.id, title: "Hello" });
  });

  it("refuses a guest", async () => {
    await expect(guest().api.post.create({ title: "Hello", body: "" })).rejects.toBeTrpcError("UNAUTHORIZED");
  });

  it.for([{ name: "empty", title: "" }, { name: "long", title: "x".repeat(256) }])("rejects a $name title", async ({ title }) => {
    const author = await userFactory();
    await expect(runAction("posts.create-post", { title, body: "" }, { actingAs: author })).rejects.toHaveValidationErrors("title");
  });
});
```

| Fixture | Does |
|---|---|
| `actingAs(user, { apiKey? })`, `guest()`, `signIn(email, password)` | `{ api, $fetch, fetch, visit, upload, listen }` |
| `runAction(name, input, { actingAs } \| { asSystem })` | call an action |
| `runJob`, `runListener`, `emit`, `workQueue()`, `runSchedule`, `runSeeder`, `runBackfill` | run app code. `workQueue()` drains queued jobs and listeners |
| `deliverWebhook(name, body)`, `renderMail(name, input)`, `sendNotification(users, name, data)` | |
| `expectRow`, `expectNoRow`, `expectCount(table, n, match?)`, `expectSoftDeleted` | rows |
| `expectQueued`, `expectMailSent(name, { to })`, `expectEmitted`, `expectListenerQueued`, `expectNotified`, `expectBroadcast`, `expectWebhookSent`, `expectAudited`, `expectPushSent` | side effects (+ `expectNo*`/`expectNot*`) |
| `expectPolicyChecked(action, table)`, `expectActionCalled(name, { actingAs })` | router hands off correctly |
| `expectRefused(router, code)` | every procedure refuses |
| `toBeTrpcError(code)`, `toBeActionError(code)`, `toHaveValidationErrors("title")` or `({ title: /required/ })` | error matchers |
| `travelTo(date)`, `travelBy(duration)`, `freezeTime()` | clock. No fixed sleeps |
| `fakeFetch(responses)`, `expectFetched(url)` | outbound HTTP |
| `enableFlag`, `disableFlag`, `forceVariant`, `exhaustRateLimit`, `startMaintenance` | state |
| `expectQueryCount({ max }, fn)`, `expectConstantQueries(fn)` | N+1 |

Each test gets a clean database. Factories need no server.

## Factories

```ts
import { faker } from "@faker-js/faker";
import { defineFactory } from "@nuxvel/nuxt/factories";
export const postFactory = defineFactory(postTable, {
  title: () => faker.lorem.sentence(),
});
await postFactory({ title: "Draft" });
await postFactory.count(5)();
await postFactory({ author: user });
await userFactory.state({ name: "Ada" }).has(3, (author) => postFactory.for("authorId", author))();
```

A missing `NOT NULL` foreign key gets a parent row from the parent table's factory. `{ author: user }` sets `authorId` (the column name minus `Id`).

## Story (component test)

```ts
import { expect } from "@nuxvel/nuxt/storybook/test";
const remove = trpcSpy("post.delete", () => undefined);
export const Deletes: StoryObj<typeof meta> = {
  parameters: { msw: [mockTrpc({ post: { delete: remove } }), mockUser({ email: "ada@example.com" })] },
  play: async () => {
    await button(page, "Delete").click();
    await expect(remove).toHaveBeenCalledWith({ id: 1 });
  },
};
```

## End-to-end

```ts
const page = await actingAs(await userFactory()).visit("/posts");
await fillForm(page, { Title: "Hello" });
await button(page, "Create").click();
await expect(toast(page)).toHaveText("Post created");
```

Locators (both browser layers): `button`, `link`, `heading`, `field`, `text`, `cell`, `dialog`, `alert`, `toast`, `fillForm`, `trpcSpy`. Timers: `visit(path, { clock: true })`. `expectAccessible(page)`.
