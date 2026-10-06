# Tutorial: event-driven orders

## Introduction

This tutorial builds a small shop, one feature per chapter. A signed-in buyer orders a product. That one fact starts four pieces of work:

- The stock of the product goes down, in the same transaction as the order.
- A sale row goes into an analytics table.
- The buyer gets a confirmation mail.
- An external invoicing service issues an invoice, and the app stores its number.

The action that places the order knows only about the order. Domain events, queued listeners and a job do the rest, after the commit. The chapters go deep on what happens between the commit and each piece of work:

- an event, a sync listener and two queued listeners (`make:event`, `make:listener`)
- `dispatchAfterCommit()` and the transactional outbox, and why a crash between the commit and the queue loses nothing
- a job with retries, backoff, a timeout and `unique`, and how each kind of error fails or retries it
- listeners and jobs that are safe to run two times
- the logs of the flow, a failed job and its retry
- a change of a column on a large table: an expand migration, a backfill and a contract migration

Most tests are functional: `emit`, `runListener`, `runJob`, `workQueue`, `runBackfill`, the queue fake, the outbound request fake and the clock. One component test and one browser test cover the page. See [Testing](../testing.md#introduction) for the three layers.

This tutorial expects that you know the basics of nuxvel. If you do not, do the [first app tutorial](./first-app.md) first. You need Node.js 24 and Docker. Run every command from the app folder, unless a chapter says otherwise.

## 1. Create the app

```bash
npm create nuxvel@latest shop
cd shop
npm install
```

Start the dev services and run the functional tests of the starter:

```bash
./nv services up
npm run test:functional
```

```
◇ Started dev services (docker compose) (5.1s)
◇ Built the app for tests: no earlier build (14.6s)

 Test Files  2 passed (2)
      Tests  5 passed (5)
```

## 2. Products and orders

A product has a name, a price in cents and a stock. An order has a buyer, a product, a quantity and a total. The first version of the app stores the total as a decimal, for example `25.00`. Chapter 11 changes it to cents on a table that already holds rows.

An invoice and a sale each belong to one order. Generate the four tables:

```bash
./nv make:schema product name price_cents:integer stock:integer
./nv make:schema order buyer:references=user product:references quantity:integer total:decimal
./nv make:schema invoice order:references:unique number:unique
./nv make:schema sale order:references:unique product:references day:date revenue_cents:integer
```

```
✔ Created server/database/schema/product.schema.ts
✔ Created shared/schemas/product.ts
◇ Updated types (nuxt prepare) (2.7s)
✔ Created server/database/schema/order.schema.ts
✔ Created shared/schemas/order.ts
◇ Updated types (nuxt prepare) (1.8s)
✔ Created server/database/schema/invoice.schema.ts
✔ Created shared/schemas/invoice.ts
◇ Updated types (nuxt prepare) (1.6s)
✔ Created server/database/schema/sale.schema.ts
✔ Created shared/schemas/sale.ts
◇ Updated types (nuxt prepare) (1.6s)
```

`total:decimal` is a `numeric(10, 2)` column. Drizzle reads it as a string, so no rounding occurs on the way. `order:references:unique` gives the invoice and the sale a unique `order_id`. That unique constraint is the key that makes the listeners of chapter 4 safe to run two times.

The order also needs a column that records when the confirmation mail went out. Add `confirmationSentAt` to the order table:

```ts
// server/database/schema/order.schema.ts
import { index, integer, numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { timestamps } from "@nuxvel/nuxt/database";
import { userTable } from "./auth.schema";
import { productTable } from "./product.schema";

export const orderTable = pgTable("order", {
  id: serial("id").primaryKey(),
  buyerId: text("buyer_id").notNull().references(() => userTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => productTable.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull(),
  total: numeric("total", { precision: 10, scale: 2 }).notNull(),
  confirmationSentAt: timestamp("confirmation_sent_at"),
  ...timestamps(),
}, (table) => [index("order_buyer_id_idx").on(table.buyerId), index("order_product_id_idx").on(table.productId)]);

export type OrderRow = typeof orderTable.$inferSelect;
export type NewOrderRow = typeof orderTable.$inferInsert;
```

The generator gives `invoice` and `sale` an index on `order_id` next to the unique constraint. Postgres already builds an index for a unique constraint, so delete the extra index. The invoice keeps no index list:

```ts
// server/database/schema/invoice.schema.ts
import { integer, pgTable, serial, varchar } from "drizzle-orm/pg-core";
import { timestamps } from "@nuxvel/nuxt/database";
import { orderTable } from "./order.schema";

export const invoiceTable = pgTable("invoice", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().unique().references(() => orderTable.id, { onDelete: "cascade" }),
  number: varchar("number", { length: 255 }).notNull().unique(),
  ...timestamps(),
});

export type InvoiceRow = typeof invoiceTable.$inferSelect;
export type NewInvoiceRow = typeof invoiceTable.$inferInsert;
```

The sale keeps its index on `product_id`:

```ts
// server/database/schema/sale.schema.ts
import { date, index, integer, pgTable, serial } from "drizzle-orm/pg-core";
import { timestamps } from "@nuxvel/nuxt/database";
import { orderTable } from "./order.schema";
import { productTable } from "./product.schema";

export const saleTable = pgTable("sale", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().unique().references(() => orderTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => productTable.id, { onDelete: "cascade" }),
  day: date("day").notNull(),
  revenueCents: integer("revenue_cents").notNull(),
  ...timestamps(),
}, (table) => [index("sale_product_id_idx").on(table.productId)]);

export type SaleRow = typeof saleTable.$inferSelect;
export type NewSaleRow = typeof saleTable.$inferInsert;
```

No form edits an invoice or a sale. Delete their Zod files:

```bash
rm shared/schemas/invoice.ts shared/schemas/sale.ts
```

Write, apply and check the migration. `db:check` accepts the unique constraint as the index of each foreign key:

```bash
./nv db:generate --name shop
./nv db:migrate
./nv db:check
```

```
✔ Every foreign key has an index
✔ Every migration is in order
✔ Every migration is safe to deploy
```

### The shared schemas

The browser sends a product and a quantity. The action takes the buyer from the session and the price from the product, so the input has neither. Replace the two generated files:

```ts
// shared/schemas/order.ts
import { z } from "zod";

export const placeOrderInput = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().min(1, "Order at least one").max(10, "Order at most ten"),
});

export const orderSchema = z.object({
  id: z.number(),
  productName: z.string(),
  quantity: z.number(),
  total: z.string(),
  invoiceNumber: z.string().nullable(),
  createdAt: z.date(),
});

export type OrderSummary = z.infer<typeof orderSchema>;
```

```ts
// shared/schemas/product.ts
import { z } from "zod";

export const productSchema = z.object({
  id: z.number(),
  name: z.string(),
  priceCents: z.number(),
  stock: z.number(),
});
```

### Factories and the seeder

```bash
./nv make:factory product
./nv make:factory order
```

Give a product a real name and 10 items in stock. Keep the quantity of an order small:

```ts
// server/factories/product.factory.ts
import { faker } from "@faker-js/faker";
import { defineFactory } from "@nuxvel/nuxt/factories";
import { productTable } from "#nuxvel/schema";

export const productFactory = defineFactory(productTable, {
  name: () => faker.commerce.productName(),
  priceCents: () => faker.number.int({ min: 500, max: 5000 }),
  stock: 10,
});
```

```ts
// server/factories/order.factory.ts
import { faker } from "@faker-js/faker";
import { productFactory } from "./product.factory";
import { userFactory } from "./users.factory";
import { defineFactory } from "@nuxvel/nuxt/factories";
import { orderTable } from "#nuxvel/schema";

export const orderFactory = defineFactory(orderTable, {
  buyerId: async () => (await userFactory()).id,
  productId: async () => (await productFactory()).id,
  quantity: () => faker.number.int({ min: 1, max: 3 }),
  total: () => faker.finance.amount({ max: 9 }),
});
```

Add two products to the starter's seeder:

```ts
// server/seeders/database.seeder.ts
import { productFactory, userFactory } from "#nuxvel/factories";

const DEMO_EMAIL = "demo@example.com";
const DEMO_PASSWORD = "demo-password";

export const databaseSeeder = defineSeeder(async () => {
  await userFactory.withPassword(DEMO_PASSWORD)({ name: "Demo User", email: DEMO_EMAIL, emailVerified: true });
  await userFactory.count(3)();
  await productFactory({ name: "Desk lamp", priceCents: 1250, stock: 5 });
  await productFactory({ name: "Notebook", priceCents: 400, stock: 20 });

  console.log(`Sign in as ${DEMO_EMAIL} with the password ${DEMO_PASSWORD}`);
});
```

```bash
./nv db:seed
```

## 3. One fact, many reactions

### The event

An event is a fact in the past tense. Its payload holds only the ID of the order. Each listener reads the current row itself, so a payload that waits on the queue never carries old data:

```bash
./nv make:event order.placed order_id:integer
./nv make:listener order.reserve-stock --event order.placed
./nv make:listener order.record-sale --event order.placed
./nv make:listener order.send-confirmation --event order.placed
```

```
✔ Created server/events/order/placed.event.ts
✔ Created server/events/order/placed.event.test.ts
◇ Updated types (nuxt prepare) (2.4s)
✔ Created server/listeners/order/reserve-stock.listener.ts
✔ Created server/listeners/order/reserve-stock.listener.test.ts
◇ Updated types (nuxt prepare) (2.4s)
✔ Created server/listeners/order/record-sale.listener.ts
✔ Created server/listeners/order/record-sale.listener.test.ts
◇ Updated types (nuxt prepare) (1.8s)
✔ Created server/listeners/order/send-confirmation.listener.ts
✔ Created server/listeners/order/send-confirmation.listener.test.ts
◇ Updated types (nuxt prepare) (1.8s)
```

An order ID is never 0 or less. Make the schema refuse it:

```ts
// server/events/order/placed.event.ts
import { z } from "zod";

export const orderPlacedEvent = defineEvent({
  payload: z.object({
    orderId: z.number().int().positive(),
  }),
});
```

### The sync listener

The stock must go down with the order, or not at all. So the stock listener is a sync listener: it runs inside the transaction of the action that emits the event.

```ts
// server/listeners/order/reserve-stock.listener.ts
import { and, eq, gte, sql } from "drizzle-orm";
import { orderPlacedEvent } from "#server/events/order/placed.event";
import { orderTable, productTable } from "#nuxvel/schema";

export const orderReserveStockListener = defineListener({
  event: orderPlacedEvent,
  sync: true,
  handler: async ({ orderId }) => {
    const order = await findOrFail(orderTable, orderId);

    const reserved = await useDb()
      .update(productTable)
      .set({ stock: sql`${productTable.stock} - ${order.quantity}` })
      .where(and(eq(productTable.id, order.productId), gte(productTable.stock, order.quantity)))
      .returning({ id: productTable.id });

    if (reserved.length === 0) {
      throw new ConflictError("Not enough stock for this order", { field: "quantity" });
    }
  },
});
```

The listener does not read the stock and then write it. One `UPDATE` checks the stock and decreases it, so two orders at the same time cannot both take the last item. Postgres locks the product row for the update. The second order waits, then sees the new stock.

When no row matches, the listener throws a `ConflictError`. The error goes up through `emit` and fails the action, and the transaction rolls back. The order row, the stock change and all the queued work disappear together. `field: "quantity"` tells a form which field gets the message. A sync listener makes no network call, so `nuxvel test:arch` accepts it. See [Domain events: sync listeners](../events.md#sync-listeners).

The generated test of the stock listener checks that the event queues it. A sync listener is not queued. Delete the test: the tests of the action and the event cover the listener.

```bash
rm server/listeners/order/reserve-stock.listener.test.ts
```

### The action

```bash
./nv make:action order/place-order product_id:integer quantity:integer
```

```ts
// server/actions/order/place-order.action.ts
import { orderPlacedEvent } from "#server/events/order/placed.event";
import { orderTable, productTable } from "#nuxvel/schema";

export const placeOrderAction = defineAction({
  input: placeOrderInput,
  handler: async ({ productId, quantity }, ctx) => {
    const product = await findOrFail(productTable, productId);

    const order = await useDb()
      .insert(orderTable)
      .values({ buyerId: ctx.actor.id, productId, quantity, total: ((product.priceCents * quantity) / 100).toFixed(2) })
      .returning()
      .then(firstOrFail);

    await emit(orderPlacedEvent, { orderId: order.id });
    await dispatchAfterCommit("invoice.issue", { orderId: order.id });

    return order;
  },
});
```

The action does two different things after the insert:

- `emit()` tells the rest of the app what happened. The action does not know which listeners exist. A new listener next year needs no change here.
- `dispatchAfterCommit()` starts one job that the action owns: an invoice is part of the contract of an order.

The job name must exist, or `nuxt typecheck` refuses it and the dispatch throws. Generate the job now. Chapter 5 writes its handler:

```bash
./nv make:job invoice.issue order_id:integer
```

### What happens at the commit

Every action runs in a transaction. Follow one order through it:

1. The action inserts the order.
2. `emit()` parses the payload with the event schema. It runs `order.reserve-stock` at once, in the transaction.
3. For each queued listener, `emit()` writes a row to the `outbox` table, in the same transaction. The job name of the row is `listener:order.record-sale` or `listener:order.send-confirmation`.
4. `dispatchAfterCommit()` writes one more row, `invoice.issue`, and sends a Postgres `NOTIFY` on the channel `nuxvel_outbox`.
5. The transaction commits. The order, the stock and the three outbox rows commit together, or none of them does.
6. Postgres delivers the `NOTIFY` only now, after the commit. The worker listens on the channel and relays the outbox. It locks the rows that have no `dispatched_at` with `for update skip locked`. It adds each row to the BullMQ queue, then sets `dispatched_at` and clears the payload.
7. The worker runs each job.

Nothing talks to Redis inside the transaction. So a rollback leaves no job behind, and a job never runs for an order that the database does not have.

The window between step 5 and step 6 is the dangerous one. What if the process stops there, after the commit and before the relay?

- The rows are in the database, with no `dispatched_at`. The worker also relays every second, and any worker can do it. The next relay finds the rows, so nothing is lost.
- A relay can also stop after it adds a row to the queue and before it sets `dispatched_at`. The next relay then adds the same row again. So a job or a listener can run two times. Chapter 4 makes each one safe for that.

See [Queues: the outbox](../queues.md#the-outbox).

### Test the action

Replace the generated test:

```ts
// server/actions/order/place-order.action.test.ts
import { defineFactory } from "@nuxvel/nuxt/factories";
import { expect, expectCount, expectListenerQueued, expectListenerRan, expectNotQueued, expectQueued, expectRow, runAction } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { orderTable, outboxTable, productTable } from "#nuxvel/schema";
import { orderFactory, productFactory, userFactory } from "#nuxvel/factories";

const outboxRowFactory = defineFactory(outboxTable, { jobName: "invoice.issue" });

describe("order.place-order action", () => {
  it("reserves the stock and queues the follow-up work after the commit", async () => {
    const buyer = await userFactory();
    const product = await productFactory({ priceCents: 1250, stock: 5 });

    const order = await runAction("order.place-order", { productId: product.id, quantity: 2 }, { actingAs: buyer });

    expect(order.total).toBe("25.00");
    await expectRow(productTable, { id: product.id, stock: 3 });
    await expectListenerRan("order.reserve-stock");
    await expectQueued("invoice.issue", { orderId: order.id }, { times: 1 });
    await expectListenerQueued("order.record-sale");
    await expectListenerQueued("order.send-confirmation");
    await expectCount(outboxTable, 3);
  });

  it("keeps nothing when the stock runs out", async () => {
    const buyer = await userFactory();
    const product = await productFactory({ stock: 1 });

    await expect(
      runAction("order.place-order", { productId: product.id, quantity: 2 }, { actingAs: buyer }),
    ).rejects.toBeTrpcError("CONFLICT");

    await expectCount(orderTable, 0);
    await expectRow(productTable, { id: product.id, stock: 1 });
    await expectCount(outboxTable, 0);
    await expectNotQueued("invoice.issue");
  });

  it("queues a row that a stopped process left in the outbox", async () => {
    const order = await orderFactory();
    await outboxRowFactory({ payload: { version: 1, payload: { orderId: order.id } } });

    await expectQueued("invoice.issue", { orderId: order.id });
    await expectCount(outboxTable, 0, { dispatchedAt: null });
  });
});
```

A functional test never reaches the real queue. The test server relays the outbox as the worker does, into a queue fake. `expectQueued` and `expectListenerQueued` relay first, then read the fake.

- The first test checks both halves of the commit: the sync listener changed the stock, and the three outbox rows reached the queue.
- The second test proves the rollback. The stock conflict leaves no order, no stock change and no outbox row.
- The third test plays the crash. A factory writes an outbox row directly, as a process that committed and then stopped before its relay. The row has the envelope `{ version, payload }` that `dispatchAfterCommit()` writes. The next relay puts the job on the queue and marks the row.

The generated test of the event emits `{ orderId: 1 }`, and no such order exists, so the stock listener throws. Replace it:

```ts
// server/events/order/placed.event.test.ts
import { emit, expect, expectEmitted, expectListenerQueued, expectListenerRan } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { orderFactory } from "#nuxvel/factories";

describe("order.placed event", () => {
  it("runs the stock listener now and queues the others", async () => {
    const order = await orderFactory({ quantity: 1 });

    await emit("order.placed", { orderId: order.id });

    await expectEmitted("order.placed", { orderId: order.id });
    await expectListenerRan("order.reserve-stock");
    await expectListenerQueued("order.record-sale");
    await expectListenerQueued("order.send-confirmation");
  });

  it("refuses a payload without an order", async () => {
    await expect(emit("order.placed", { orderId: 0 })).rejects.toBeTrpcError("BAD_REQUEST");
  });
});
```

`emit` from `@nuxvel/nuxt/testing` emits in a transaction, as an action does. The schema refuses `orderId: 0` at the emit, before any listener runs.

## 4. Listeners that can run two times

A queued listener runs in the worker, after the commit, with no transaction around it. Chapter 3 showed that it can run two times for one event. A retry after a failure also runs it again. Each queued listener must give the same result for one run or for two.

### A unique key: the sale

```ts
// server/listeners/order/record-sale.listener.ts
import { orderPlacedEvent } from "#server/events/order/placed.event";
import { orderTable, saleTable } from "#nuxvel/schema";

export const orderRecordSaleListener = defineListener({
  event: orderPlacedEvent,
  handler: async ({ orderId }) => {
    const order = await findOrFail(orderTable, orderId);

    await useDb()
      .insert(saleTable)
      .values({
        orderId: order.id,
        productId: order.productId,
        day: order.createdAt.toISOString().slice(0, 10),
        revenueCents: Math.round(Number(order.total) * 100),
      })
      .onConflictDoNothing({ target: saleTable.orderId });
  },
});
```

The `sale` table has a unique `order_id`. A second run tries the same insert, and Postgres ignores it. Two things in this listener are easy to get wrong:

- `onConflictDoNothing` names its target. Without a target, Postgres ignores a conflict on any unique constraint, and a bug that writes the wrong row stays silent.
- The day comes from `order.createdAt`, not from the clock. The listener runs after the commit, maybe minutes later, maybe after a retry the next day. A sale belongs to the day of the order. The day is in UTC.

A counter such as `update daily_sales set count = count + 1` is not safe: a second run counts the order two times. Write one row for each fact, and sum the rows when you read them.

### A claim: the mail

A mail has no unique key in the database. The listener claims the order first:

```ts
// server/listeners/order/send-confirmation.listener.ts
import { and, eq, isNull } from "drizzle-orm";
import { orderPlacedEvent } from "#server/events/order/placed.event";
import { userTable, orderTable, productTable } from "#nuxvel/schema";

export const orderSendConfirmationListener = defineListener({
  event: orderPlacedEvent,
  handler: async ({ orderId }) => {
    await transaction(async () => {
      const claimed = await useDb()
        .update(orderTable)
        .set({ confirmationSentAt: now() })
        .where(and(eq(orderTable.id, orderId), isNull(orderTable.confirmationSentAt)))
        .returning();
      const order = claimed[0];
      if (!order) return;

      const buyer = await findOrFail(userTable, order.buyerId);
      const product = await findOrFail(productTable, order.productId);

      await sendMail("order.confirmation", {
        to: buyer.email,
        orderId: order.id,
        productName: product.name,
        quantity: order.quantity,
        total: order.total,
      });
    });
  },
});
```

The `UPDATE` sets `confirmation_sent_at` only when it is still empty, and returns the row only to the run that set it. A second run gets no row and stops.

`sendMail()` does not send the mail. It writes an outbox row for the built-in `nuxvel.mail` job, in the transaction. So the claim and the mail commit together. When the transaction fails, the claim rolls back too, and the next run tries again. `now()` is the server clock that the test fixtures move. See [Database: the current time](../database.md#the-current-time).

Write the mail:

```bash
./nv make:mail order.confirmation
```

```ts
// server/mail/order/confirmation.mail.ts
import { h } from "vue";
import { z } from "zod";
import OrderConfirmation from "./templates/OrderConfirmation.vue";

export const orderConfirmationMail = defineMail({
  input: z.object({ to: z.email(), orderId: z.number(), productName: z.string(), quantity: z.number(), total: z.string() }),
  subject: ({ orderId }) => `Order #${orderId} is confirmed`,
  render: (props) => h(OrderConfirmation, props),
});
```

```vue
<!-- server/mail/order/templates/OrderConfirmation.vue -->
<script setup lang="ts">
defineProps<{ orderId: number; productName: string; quantity: number; total: string }>();
</script>

<template>
  <MailLayout :preview="`Order #${orderId} is confirmed`">
    <EHeading>Order #{{ orderId }} is confirmed</EHeading>
    <EText>{{ quantity }} × {{ productName }}, total ${{ total }}.</EText>
    <EText>Your orders page shows the invoice number when it is ready.</EText>
  </MailLayout>
</template>
```

Replace the generated mail test:

```ts
// server/mail/order/confirmation.mail.test.ts
import { expect, renderMail } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";

describe("order.confirmation mail", () => {
  it("shows the order", async () => {
    const { subject, text } = await renderMail("order.confirmation", {
      to: "ada@example.com",
      orderId: 7,
      productName: "Desk lamp",
      quantity: 2,
      total: "25.00",
    });

    expect(subject).toBe("Order #7 is confirmed");
    expect(text).toContain("2 × Desk lamp, total $25.00.");
  });
});
```

### Test the listeners

`runListener` runs the handler of a queued listener in the app now, with no queue. Run each listener two times and check that the effect occurred once:

```ts
// server/listeners/order/record-sale.listener.test.ts
import { expect, expectCount, expectRow, freezeTime, runListener, travelBy } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { saleTable } from "#nuxvel/schema";
import { orderFactory } from "#nuxvel/factories";

describe("order.record-sale listener", () => {
  it("writes one sale, however often it runs", async () => {
    const order = await orderFactory({ total: "25.00" });

    await runListener("order.record-sale", { orderId: order.id });
    await runListener("order.record-sale", { orderId: order.id });

    await expectCount(saleTable, 1);
    await expectRow(saleTable, { orderId: order.id, revenueCents: 2500 });
  });

  it("counts the sale on the day of the order, not the day of the run", async () => {
    await freezeTime(new Date("2026-10-02T23:59:30Z"));
    const order = await orderFactory();

    const ranAt = await travelBy({ minutes: 1 });
    await runListener("order.record-sale", { orderId: order.id });

    expect(ranAt.toISOString()).toBe("2026-10-03T00:00:30.000Z");
    await expectRow(saleTable, { orderId: order.id, day: "2026-10-02" });
  });
});
```

The second test stops the clock 30 seconds before midnight. The factory writes the order at that time, because `timestamps()` reads the moved clock. `travelBy` moves the app past midnight before the listener runs. The sale still goes on the day of the order. A listener that used `now()` for the day fails this test. See [Testing: controlling time](../testing.md#controlling-time).

```ts
// server/listeners/order/send-confirmation.listener.test.ts
import { expectMailSent, runListener } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { orderFactory, userFactory } from "#nuxvel/factories";

describe("order.send-confirmation listener", () => {
  it("sends one mail, however often it runs", async () => {
    const buyer = await userFactory({ email: "ada@example.com" });
    const order = await orderFactory({ buyerId: buyer.id, quantity: 2, total: "25.00" });

    await runListener("order.send-confirmation", { orderId: order.id });
    await runListener("order.send-confirmation", { orderId: order.id });

    await expectMailSent("order.confirmation", { to: "ada@example.com", orderId: order.id, total: "25.00" }, { times: 1 });
  });
});
```

`{ times: 1 }` fails when the mail went out two times.

## 5. The invoice job

The invoicing service is outside the app. It can be slow, down or refuse an order. A job is the right place for that call: it has retries, a backoff and a timeout, and listeners have none of these.

Chapter 3 generated the job. The job reads the URL of the service from the runtime config. Add it to `nuxt.config.ts`. `NUXT_INVOICING_URL` overrides it:

```ts
// nuxt.config.ts
  modules: ['@nuxvel/nuxt'],
  runtimeConfig: {
    invoicingUrl: 'https://invoicing.example.com',
  },
```

```ts
// server/jobs/invoice/issue.job.ts
import { eq } from "drizzle-orm";
import { z } from "zod";
import { userTable, invoiceTable, orderTable } from "#nuxvel/schema";

export const invoiceIssueJob = defineJob({
  attempts: 5,
  backoff: { type: "exponential", delay: 2_000 },
  timeout: 10_000,
  unique: ({ orderId }) => String(orderId),
  input: z.object({
    orderId: z.number().int().positive(),
  }),
  handler: async ({ orderId }) => {
    const issued = await useDb().select().from(invoiceTable).where(eq(invoiceTable.orderId, orderId));
    if (issued.length > 0) return;

    const order = await findOrFail(orderTable, orderId);
    const buyer = await findOrFail(userTable, order.buyerId);

    const { number } = await $fetch<{ number: string }>("/invoices", {
      baseURL: useRuntimeConfig().invoicingUrl,
      method: "POST",
      headers: { "Idempotency-Key": `order-${order.id}` },
      body: { reference: `order-${order.id}`, email: buyer.email, total: order.total },
    }).catch((error) => {
      if (error?.status === 422) throw new ConflictError(`The invoicing service refused order ${order.id}`);
      throw error;
    });

    await useDb().insert(invoiceTable).values({ orderId: order.id, number }).onConflictDoNothing({ target: invoiceTable.orderId });
    useLogger("invoice").info("invoice issued", { orderId: order.id, number });
  },
});
```

The options set how the worker runs the job:

| Option | Value | Effect |
|---|---|---|
| `attempts` | `5` | The first run and four retries. Then the job goes to the failed set. |
| `backoff` | exponential, from 2 s | The worker waits 2, 4, 8 and 16 seconds between the attempts. |
| `timeout` | `10_000` | An attempt that runs longer than 10 seconds fails and retries. nuxvel does not stop the handler. |
| `unique` | the order ID | While a job with the key `invoice.issue:<orderId>` waits or runs, a second dispatch with that key is not added. |

The job is safe to run two times in three ways:

1. It looks for an invoice first. A second run after a success calls nothing.
2. It sends an `Idempotency-Key` header. A run that stopped after the call and before the insert calls the service again with the same key. A service that honours the key returns the same invoice.
3. The insert has the unique `order_id` as its conflict target.

Each kind of error does something different in the worker:

| What happens | Error | The worker |
|---|---|---|
| The service answers 5xx or 408, or does not answer | `$fetch` throws, nuxvel turns it into a `TransientError` | retries with the backoff |
| The service answers 429 | nuxvel turns it into a `RateLimitedError` | retries with the backoff |
| The service answers 422 | the handler throws a `ConflictError` | fails the job at once |
| The order does not exist | `findOrFail` throws a `NotFoundError` | fails the job at once |
| The payload fails the `input` schema | `ValidationFailedError` | fails the job at once |

A retry cannot fix a refused order or a missing row, so these fail at once. Any other error retries. See [Queues: failures and retries](../queues.md#failures-and-retries).

### Test the job

`runJob` runs the handler in the app now, with no queue. `fakeFetch` answers each outbound request of the app for the rest of the test. A request to a URL that no key matches fails as if the service did not answer:

```ts
// server/jobs/invoice/issue.job.test.ts
import { expect, expectFetched, expectLogged, expectNoRow, expectNotFetched, expectRow, fakeFetch, runJob } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { invoiceTable } from "#nuxvel/schema";
import { orderFactory } from "#nuxvel/factories";

const invoices = "https://invoicing.example.com/invoices";

describe("invoice.issue job", () => {
  it("stores the number that the invoicing service gives", async () => {
    await fakeFetch({ [invoices]: { status: 201, body: { number: "INV-1001" } } });
    const order = await orderFactory();

    await runJob("invoice.issue", { orderId: order.id });

    await expectRow(invoiceTable, { orderId: order.id, number: "INV-1001" });
    await expectFetched(invoices, { method: "POST", times: 1 });
    await expectLogged("info", "invoice issued");
  });

  it("calls the service once, however often it runs", async () => {
    await fakeFetch({ [invoices]: { status: 201, body: { number: "INV-1002" } } });
    const order = await orderFactory();

    await runJob("invoice.issue", { orderId: order.id });
    await runJob("invoice.issue", { orderId: order.id });

    await expectFetched(invoices, { times: 1 });
  });

  it("retries while the service is down", async () => {
    await fakeFetch({ [invoices]: { status: 503 } });
    const order = await orderFactory();

    await expect(runJob("invoice.issue", { orderId: order.id })).rejects.toBeRetryable();
    await expectNoRow(invoiceTable, { orderId: order.id });
  });

  it("retries when the service does not answer", async () => {
    await fakeFetch({});
    const order = await orderFactory();

    await expect(runJob("invoice.issue", { orderId: order.id })).rejects.toBeRetryable();
  });

  it("fails at once when the service refuses the order", async () => {
    await fakeFetch({ [invoices]: { status: 422, body: { error: "unknown email domain" } } });
    const order = await orderFactory();

    await expect(runJob("invoice.issue", { orderId: order.id })).rejects.toBeUnrecoverable();
  });

  it("fails at once for an order that does not exist", async () => {
    await fakeFetch({});

    await expect(runJob("invoice.issue", { orderId: 999 })).rejects.toBeUnrecoverable();
    await expectNotFetched(invoices);
  });
});
```

`toBeRetryable()` and `toBeUnrecoverable()` apply the same rules as the worker to the rejection of `runJob`. So the test checks the decision of the worker without five real attempts and 30 seconds of backoff.

`fakeFetch({})` with no keys fakes a service that is down. It also makes sure that a test never calls the real service.

### A second dispatch: `unique`

A buyer whose invoice is late can ask for it again. Two clicks must not start two calls to the service. Add an action that dispatches the job again:

```bash
./nv make:action invoice/request-invoice order_id:integer
```

```ts
// server/actions/invoice/request-invoice.action.ts
import { z } from "zod";
import { orderTable } from "#nuxvel/schema";

export const requestInvoiceAction = defineAction({
  input: z.object({ orderId: z.number().int().positive() }),
  handler: async ({ orderId }, ctx) => {
    const order = await findOrFail(orderTable, orderId);
    if (order.buyerId !== ctx.actor.id) throw new NotFoundError();

    await dispatchAfterCommit("invoice.issue", { orderId: order.id });
  },
});
```

A buyer who asks for the order of another buyer gets `NOT_FOUND`, as if the order did not exist. Replace the generated test:

```ts
// server/actions/invoice/request-invoice.action.test.ts
import { expect, expectQueued, runAction } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { orderFactory, userFactory } from "#nuxvel/factories";

describe("invoice.request-invoice action", () => {
  it("adds no second job while the first one waits", async () => {
    const buyer = await userFactory();
    const order = await orderFactory({ buyerId: buyer.id });

    await runAction("invoice.request-invoice", { orderId: order.id }, { actingAs: buyer });
    await runAction("invoice.request-invoice", { orderId: order.id }, { actingAs: buyer });

    await expectQueued("invoice.issue", { orderId: order.id }, { times: 1 });
  });

  it("refuses an order of another buyer", async () => {
    const order = await orderFactory();

    await expect(
      runAction("invoice.request-invoice", { orderId: order.id }, { actingAs: await userFactory() }),
    ).rejects.toBeTrpcError("NOT_FOUND");
  });
});
```

The queue fake applies `unique` as BullMQ does. The second dispatch writes its outbox row, and the relay marks it as dispatched, but the queue keeps only the first job. When the job finishes, the key is free again, so a later request starts a new job. `unique` limits the queue, not the database: the first step of the handler still prevents a second invoice.

## 6. The whole chain

Each test so far checks one step. `workQueue` runs every job and queued listener that waits in the queue fake, until the fake is empty. Add a test of the whole chain to the action test:

```ts
// server/actions/order/place-order.action.test.ts
  it("ends with a sale, a mail and an invoice once the queue is worked", async () => {
    await fakeFetch({ "https://invoicing.example.com/invoices": { status: 201, body: { number: "INV-2001" } } });
    const buyer = await userFactory({ email: "ada@example.com" });
    const product = await productFactory({ priceCents: 1250 });

    const order = await runAction("order.place-order", { productId: product.id, quantity: 2 }, { actingAs: buyer });
    await workQueue();

    await expectRow(saleTable, { orderId: order.id, revenueCents: 2500 });
    await expectMailSent("order.confirmation", { to: "ada@example.com", orderId: order.id });
    await expectRow(invoiceTable, { orderId: order.id, number: "INV-2001" });
  });
```

Add `expectMailSent`, `fakeFetch` and `workQueue` to the import from `@nuxvel/nuxt/testing`, and import `invoiceTable` and `saleTable`:

```ts
// server/actions/order/place-order.action.test.ts
import { expect, expectCount, expectListenerQueued, expectListenerRan, expectMailSent, expectNotQueued, expectQueued, expectRow, fakeFetch, runAction, workQueue } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { invoiceTable, orderTable, outboxTable, productTable, saleTable } from "#nuxvel/schema";
```

`workQueue` does not run the `nuxvel.mail` job, so no mail leaves the test. `expectMailSent` reads the mail fake. Each job runs as the actor that dispatched it, as in the worker.

Keep both kinds of test. A `runListener` or `runJob` test names the step that broke. The `workQueue` test proves that the steps connect.

## 7. Watch the flow

The dev server runs the worker in the same process. To see the invoice step work, run a stand-in for the invoicing service on your machine. It answers each request with a number made from the idempotency key:

```js
// scripts/invoicing-stub.mjs
import { createServer } from "node:http";

createServer((request, response) => {
  const key = request.headers["idempotency-key"];
  console.log(request.method, request.url, key);
  response.writeHead(201, { "content-type": "application/json" });
  response.end(JSON.stringify({ number: `INV-${key}` }));
}).listen(4010, () => console.log("Invoicing stub on http://localhost:4010"));
```

Start it in one terminal, and the dev server in another one:

```bash
node scripts/invoicing-stub.mjs
NUXT_INVOICING_URL=http://localhost:4010 npm run dev
```

Give the URL on the command line, not in `.env`. The functional tests read `.env` too, and `fakeFetch` in the tests answers only `invoicing.example.com`.

### Place an order from another process

Chapter 8 adds the page. Until then, place an order from `nuxvel tinker`. Tinker runs the app in its own process. So the order shows how the outbox connects two processes: tinker commits the rows, and the worker in the dev server relays and runs them.

```bash
./nv tinker
```

```
nuxvel> const demo = (await useDb().select().from(userTable)).find((user) => user.email === "demo@example.com")
nuxvel> const order = await placeOrderAction({ productId: 1, quantity: 2 }, { actor: { type: "user", id: demo.id, role: "user" } })
01:49:41 INFO  action  order.place-order ok (29ms)  actor=user:60327c2d-4024-4fd9-84ee-64cc35026334 ok=true
nuxvel> order.id
1
```

The terminal of the dev server shows each step of the chain:

```
01:49:41 INFO  job  listener:order.record-sale #27 done  attempt=1 durationMs=34ms
01:49:41 INFO  invoice  invoice issued  orderId=1 number=INV-order-1 actor=user:60327c2d-4024-4fd9-84ee-64cc35026334
01:49:41 INFO  job  invoice.issue #29 done  attempt=1 durationMs=73ms
01:49:41 INFO  job  listener:order.send-confirmation #28 done  attempt=1 durationMs=75ms
01:49:41 INFO  job  nuxvel.mail #5 done  attempt=1 durationMs=64ms
```

- Each `job` line is one attempt, with the job name, the BullMQ job ID, the attempt and the time it took. A queued listener shows as `listener:<name>`.
- The `invoice` line comes from `useLogger("invoice")` in the job. Its `orderId` field ties it to the order.
- The `actor` field of the `invoice` line is the buyer. A job runs as the actor that dispatched it, so the lines that its handler logs and its audit rows name the buyer. A queued listener has no dispatcher, so its handler runs with no actor.
- The mail went out last. `sendMail()` in the listener wrote one more outbox row, and the worker relayed it to the `mail` queue.

To follow one order through the logs, search for its ID. Log the ID in each listener and job that you write. A job has no request ID, because it runs outside the request. See [Observability: request ID and actor](../observability.md#request-id-and-actor).

`nuxvel events` lists the event, the file that emits it and its listeners:

```bash
./nv events
```

```
EVENT         SOURCE                               EMITTED BY                                  LISTENERS
order.placed  server/events/order/placed.event.ts  server/actions/order/place-order.action.ts  order.record-sale (queued), order.reserve-stock (sync), order.send-confirmation (queued)
```

### A job that fails

Stop the stub with `Ctrl+C`, and place one more order in tinker. The sale and the mail do not need the service. The invoice job retries with its backoff, then fails:

```
01:49:54 INFO  job  listener:order.record-sale #30 done  attempt=1 durationMs=7ms
01:49:54 WARN  job  invoice.issue #32 failed, retrying (attempt 1/5)  durationMs=12ms err="An upstream service did not answer" cause=""
01:49:54 INFO  job  listener:order.send-confirmation #31 done  attempt=1 durationMs=120ms
01:49:54 INFO  job  nuxvel.mail #6 done  attempt=1 durationMs=13ms
01:49:56 WARN  job  invoice.issue #32 failed, retrying (attempt 2/5)  durationMs=7ms err="An upstream service did not answer" cause=""
01:50:00 WARN  job  invoice.issue #32 failed, retrying (attempt 3/5)  durationMs=6ms err="An upstream service did not answer" cause=""
01:50:08 WARN  job  invoice.issue #32 failed, retrying (attempt 4/5)  durationMs=20ms err="An upstream service did not answer" cause=""
01:50:24 ERROR job  invoice.issue #32 failed (attempt 5/5)  durationMs=11ms
TRPCError: An upstream service did not answer
Caused by: FetchError: [POST] "http://localhost:4010/invoices": <no response> fetch failed
    at async Object.handler (…/server/jobs/invoice/issue.job.ts:22:24)
Caused by: TypeError: fetch failed
Caused by: AggregateError [ECONNREFUSED]:
```

The gaps between the attempts are the backoff: 2, 4, 8 and 16 seconds. The retries are `warn` lines. Only the last attempt is an `error` line with the stack, and only then does error tracking get the `TransientError`. The order and the stock stay as they are: a failed job never rolls back the transaction that dispatched it.

List the failed jobs:

```bash
./nv queue:failed
```

```
QUEUE    ID  NAME           ATTEMPTS  FAILED AT                 REASON
default  32  invoice.issue  5         2026-10-02T15:50:24.593Z  An upstream service did not answer
  → Once the cause is fixed, run nuxvel queue:retry <id>, or nuxvel queue:retry all
```

Start the stub again, and retry the job:

```bash
node scripts/invoicing-stub.mjs
./nv queue:retry 32
```

```
✔ Re-enqueued 1 job(s): 32
```

```
01:50:45 INFO  invoice  invoice issued  orderId=2 number=INV-order-2 actor=user:60327c2d-4024-4fd9-84ee-64cc35026334
01:50:45 INFO  job  invoice.issue #32 done  attempt=6 durationMs=18ms
```

The retry keeps the payload and the dispatcher of the job. A failed job stays in the failed set for 7 days, so you have a week to fix the cause. The dashboard at `/_nuxvel/queue` of the dev server shows the same jobs with their payloads. See [Queues: the dashboard](../queues.md#the-dashboard).

## 8. The shop page

### The routers

```bash
./nv make:router product
./nv make:router order
```

```ts
// server/trpc/routers/product.router.ts
import { asc } from "drizzle-orm";
import { z } from "zod";
import { productTable } from "#nuxvel/schema";

export const productRouter = {
  list: publicProcedure
    .output(z.array(productSchema))
    .query(() => useDb().select().from(productTable).orderBy(asc(productTable.name))),
};
```

```ts
// server/trpc/routers/order.router.ts
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { placeOrderAction } from "#server/actions/order/place-order.action";
import { invoiceTable, orderTable, productTable } from "#nuxvel/schema";

export const orderRouter = {
  mine: authedProcedure
    .output(z.array(orderSchema))
    .query(({ ctx }) =>
      useDb()
        .select({
          id: orderTable.id,
          productName: productTable.name,
          quantity: orderTable.quantity,
          total: orderTable.total,
          invoiceNumber: invoiceTable.number,
          createdAt: orderTable.createdAt,
        })
        .from(orderTable)
        .innerJoin(productTable, eq(productTable.id, orderTable.productId))
        .leftJoin(invoiceTable, eq(invoiceTable.orderId, orderTable.id))
        .where(eq(orderTable.buyerId, ctx.actor.id))
        .orderBy(desc(orderTable.id)),
    ),
  place: authedProcedure
    .input(placeOrderInput)
    .output(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const order = await placeOrderAction(input, { actor: ctx.actor });
      return { id: order.id };
    }),
};
```

`mine` reads the orders of the buyer in one query. The left join gives `null` for `invoiceNumber` while the job has not run.

Test the router. The last test checks that the list does not run one query for each order:

```ts
// server/trpc/routers/order.router.test.ts
import { actingAs, expect, expectConstantQueries, fakeFetch, runJob } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { orderFactory, productFactory, userFactory } from "#nuxvel/factories";

describe("order router", () => {
  it("lists the orders of the buyer, with the invoice once it is issued", async () => {
    await fakeFetch({ "https://invoicing.example.com/invoices": { status: 201, body: { number: "INV-3001" } } });
    const buyer = await userFactory();
    const product = await productFactory({ name: "Desk lamp", priceCents: 1250 });
    await orderFactory();

    const { id } = await actingAs(buyer).trpc.order.place({ productId: product.id, quantity: 1 });
    expect(await actingAs(buyer).trpc.order.mine()).toMatchObject([{ id, productName: "Desk lamp", total: "12.50", invoiceNumber: null }]);

    await runJob("invoice.issue", { orderId: id });
    expect(await actingAs(buyer).trpc.order.mine()).toMatchObject([{ id, invoiceNumber: "INV-3001" }]);
  });

  it("refuses more than the stock", async () => {
    const product = await productFactory({ stock: 1 });

    await expect(actingAs(await userFactory()).trpc.order.place({ productId: product.id, quantity: 2 })).rejects.toBeTrpcError("CONFLICT");
  });

  it("lists the orders in the same number of queries for one order or for many", async () => {
    const buyer = await userFactory();

    await expectConstantQueries(async (size) => {
      await orderFactory.count(size)({ buyerId: buyer.id });
      await actingAs(buyer).trpc.order.mine();
    });
  });
});
```

The first test also creates an order of another buyer. The list must not show it. `expectConstantQueries` calls the function with 1 order and with 4 orders, and fails when the two runs count a different number of queries. See [Testing: query counts](../testing.md#query-counts).

### The components

The buy form places an order for one product. A `ConflictError` with a `field` shows under that field, so "Not enough stock for this order" shows under the quantity:

```vue
<!-- app/components/BuyForm.vue -->
<script setup lang="ts">
const props = defineProps<{ productId: number }>();

const trpc = useTRPC();
const queryCache = useQueryCache();

const form = useActionForm(placeOrderInput, toasted(trpc.order.place.mutationOptions(), "Order placed"), {
  defaults: { productId: props.productId, quantity: 1 },
  onSuccess: async () => {
    await queryCache.invalidateQueries({ key: trpc.product.key() });
    await queryCache.invalidateQueries({ key: trpc.order.key() });
  },
});
</script>

<template>
  <UForm :ref="form.ref" :schema="form.schema" :state="form.state" class="flex items-start gap-2" @submit="form.submit">
    <UFormField name="quantity" label="Quantity" class="w-28">
      <UInputNumber v-model="form.state.quantity" :min="1" :max="10" class="w-full" />
    </UFormField>
    <UButton type="submit" class="mt-6" :loading="form.pending" label="Buy" />
  </UForm>
</template>
```

After an order, the form loads the products and the orders again, so the page shows the new stock and the new order.

The order list shows the invoice number, or "Invoice pending" while the job has not run:

```vue
<!-- app/components/OrderList.vue -->
<script setup lang="ts">
defineProps<{ orders: OrderSummary[] }>();
</script>

<template>
  <UEmpty v-if="orders.length === 0" icon="i-lucide-package" title="No orders yet" />
  <ul v-else aria-label="Your orders" class="divide-y divide-default">
    <li v-for="order in orders" :key="order.id" class="flex items-center justify-between gap-4 py-3">
      <span>Order #{{ order.id }}: {{ order.quantity }} × {{ order.productName }}, ${{ order.total }}</span>
      <UBadge v-if="order.invoiceNumber" color="success" variant="subtle" :label="`Invoice ${order.invoiceNumber}`" />
      <UBadge v-else color="neutral" variant="subtle" label="Invoice pending" />
    </li>
  </ul>
</template>
```

### The page

```bash
./nv make:page shop
```

```vue
<!-- app/pages/shop.vue -->
<script setup lang="ts">
definePageMeta({ middleware: "auth" });

const trpc = useTRPC();
const products = useQuery(trpc.product.list.queryOptions());
const orders = useQuery(trpc.order.mine.queryOptions());

useSeo({ title: "Shop" });
</script>

<template>
  <div class="max-w-2xl space-y-8">
    <h1 class="text-2xl font-semibold">Shop</h1>
    <QueryState :query="products">
      <template #default="{ data }">
        <ul aria-label="Products" class="space-y-4">
          <li v-for="product in data" :key="product.id" class="flex items-end justify-between gap-4">
            <div>
              <p class="font-medium">{{ product.name }}</p>
              <p class="text-sm text-muted">${{ (product.priceCents / 100).toFixed(2) }}, {{ product.stock }} in stock</p>
            </div>
            <BuyForm :product-id="product.id" />
          </li>
        </ul>
      </template>
    </QueryState>
    <h2 class="text-xl font-semibold">Your orders</h2>
    <QueryState :query="orders">
      <template #default="{ data }">
        <OrderList :orders="data" />
      </template>
    </QueryState>
  </div>
</template>
```

Open `/shop`, sign in as the demo user and buy a desk lamp. The new order shows "Invoice pending" first. The invoice job runs a moment later. Reload the page to see its number. To update the list without a reload, broadcast from the job and use `useLiveQuery()`. See [Realtime](../realtime.md).

## 9. Component test

`OrderList` has two states for an order and one for no orders. Generate a story:

```bash
./nv make:story OrderList
```

```ts
// app/components/OrderList.stories.ts
import type { Meta, StoryObj } from "@storybook-vue/nuxt";
import { expect, page, text } from "@nuxvel/nuxt/storybook/test";
import OrderList from "./OrderList.vue";

const invoiced = { id: 2, productName: "Desk lamp", quantity: 2, total: "25.00", invoiceNumber: "INV-1001", createdAt: new Date("2026-10-02T09:00:00Z") };
const pending = { id: 3, productName: "Notebook", quantity: 1, total: "4.00", invoiceNumber: null, createdAt: new Date("2026-10-02T09:05:00Z") };

const meta = { component: OrderList, args: { orders: [pending, invoiced] } } satisfies Meta<typeof OrderList>;
export default meta;

export const InvoicedAndPending: StoryObj<typeof meta> = {
  play: async () => {
    await expect(text(page, "Order #2: 2 × Desk lamp, $25.00")).toBeVisible();
    await expect(text(page, "Invoice INV-1001")).toBeVisible();
    await expect(text(page, "Invoice pending")).toHaveCount(1);
  },
};

export const Empty: StoryObj<typeof meta> = {
  args: { orders: [] },
  play: async () => {
    await expect(text(page, "No orders yet")).toBeVisible();
  },
};
```

```bash
npm run test:ui
```

```
 Test Files  3 passed (3)
      Tests  6 passed (6)
```

The other two files are the starter's stories. Each story also gets an accessibility check with axe. See [Testing: component tests](../testing.md#component-tests).

## 10. Browser test

The browser test follows one buyer through the page, and works the queue in the middle of the journey:

```bash
./nv make:test shop --e2e
```

```ts
// tests/e2e/shop.test.ts
import { actingAs, button, expect, expectMailSent, fakeFetch, fillForm, text, workQueue } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { productFactory, userFactory } from "#nuxvel/factories";

describe("the shop in a browser", () => {
  it("places an order and shows its invoice once the queue has run", async () => {
    await fakeFetch({ "https://invoicing.example.com/invoices": { status: 201, body: { number: "INV-4001" } } });
    const buyer = await userFactory({ email: "ada@example.com" });
    await productFactory({ name: "Desk lamp", priceCents: 1250, stock: 3 });

    const page = await actingAs(buyer).visit({ name: "shop" });
    await expect(text(page, "$12.50, 3 in stock")).toBeVisible();

    await fillForm(page, { Quantity: "4" });
    await button(page, "Buy").click();
    await expect(text(page, "Not enough stock for this order")).toBeVisible();

    await fillForm(page, { Quantity: "2" });
    await button(page, "Buy").click();
    await expect(text(page, "Order placed")).toBeVisible();
    await expect(text(page, "$12.50, 1 in stock")).toBeVisible();
    await expect(text(page, /: 2 × Desk lamp, \$25\.00$/)).toBeVisible();
    await expect(text(page, "Invoice pending")).toBeVisible();

    await workQueue();
    await expectMailSent("order.confirmation", { to: "ada@example.com" });

    await page.reload();
    await expect(text(page, "Invoice INV-4001")).toBeVisible();
  });
});
```

The browser test uses the same fakes as a functional test. No worker runs, so the invoice stays pending until the test calls `workQueue()`. That makes the moment between the order and the invoice visible: the page shows "Invoice pending", then the number after the reload. A test with a real worker could not hold that moment still.

The order ID is not known in the test, so a regular expression matches the end of the line.

```bash
npm run test:e2e
```

```
 Test Files  2 passed (2)
      Tests  5 passed (5)
```

## 11. Change a column on a large table

The total of an order is a decimal string. The sale listener converts it to cents, and the invoicing service wants the amount as a string. The team decides to store `total_cents` as an integer and drop `total`.

On a small table, one migration could do it. A large table breaks it in two ways, because during a deploy the old release still serves requests while the new one starts:

- The old release still writes `total`. A migration that drops it breaks the old release.
- A single `UPDATE` of every row holds a lock on the table for a long time, and one failure rolls back all the work.

So the change goes in three steps, over two releases:

1. **Expand.** Add `total_cents` as a nullable column. The code writes both columns.
2. **Backfill.** Fill `total_cents` for the old rows, one batch at a time.
3. **Contract.** Read only `total_cents`, make it `NOT NULL` and drop `total`.

### Expand

Add the nullable column next to `total`:

```ts
// server/database/schema/order.schema.ts
  total: numeric("total", { precision: 10, scale: 2 }).notNull(),
  totalCents: integer("total_cents"),
```

```bash
./nv db:generate --name order-total-cents
```

```sql
-- server/database/migrations/0018_order-total-cents.sql
ALTER TABLE "order" ADD COLUMN "total_cents" integer;
```

A nullable column with no default changes no row, so the migration is fast on any size of table. Write both columns in the action:

```ts
// server/actions/order/place-order.action.ts
    const totalCents = product.priceCents * quantity;

    const order = await useDb()
      .insert(orderTable)
      .values({ buyerId: ctx.actor.id, productId, quantity, total: (totalCents / 100).toFixed(2), totalCents })
      .returning()
      .then(firstOrFail);
```

From now on, each new order has both values. The backfill only has to fill the orders from before. So the dual write ships before the backfill runs. A backfill that completed does not run again, and a row that old code writes after it stays empty.

### The backfill

```bash
./nv make:backfill order-total-cents --table order
```

```
✔ Created server/database/backfills/order-total-cents.backfill.ts
✔ Created server/database/backfills/order-total-cents.backfill.test.ts
◇ Updated types (nuxt prepare) (2.7s)
```

A first version updates each row of the batch:

```ts
// server/database/backfills/order-total-cents.backfill.ts
import { eq, isNull } from "drizzle-orm";
import { orderTable } from "#nuxvel/schema";

export const orderTotalCentsBackfill = defineBackfill({
  table: orderTable,
  batchSize: 1_000,
  where: isNull(orderTable.totalCents),
  async handler(rows) {
    for (const row of rows) {
      await useDb()
        .update(orderTable)
        .set({ totalCents: Math.round(Number(row.total) * 100) })
        .where(eq(orderTable.id, row.id));
    }
  },
});
```

`where` limits the backfill to the rows that still need it. The backfill reads the rows in ID order, `batchSize` at a time, and gives each batch to the handler. Each batch runs in its own transaction, together with the progress row of the backfill in the `backfills` table. A crash or a deploy during a run loses only the current batch. The next run starts after the last committed batch. See [Backfills](../backfills.md).

Replace the generated test:

```ts
// server/database/backfills/order-total-cents.backfill.test.ts
import { expect, expectCount, expectQueryCount, expectRow, runBackfill } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { backfillsTable, orderTable } from "#nuxvel/schema";
import { orderFactory } from "#nuxvel/factories";

describe("order-total-cents backfill", () => {
  it("fills the cents of every old order", async () => {
    const old = await orderFactory({ total: "25.00", totalCents: null });
    const fresh = await orderFactory({ total: "4.00", totalCents: 400 });

    await runBackfill("order-total-cents");

    await expectRow(orderTable, { id: old.id, totalCents: 2500 });
    await expectRow(orderTable, { id: fresh.id, totalCents: 400 });
    const state = await expectRow(backfillsTable, { name: "order-total-cents" });
    expect(state.completedAt).toBeInstanceOf(Date);
    expect(state).toMatchObject({ processed: 1, total: 1 });
  });

  it("does nothing on a second run", async () => {
    await orderFactory({ total: "25.00", totalCents: null });
    await runBackfill("order-total-cents");

    await orderFactory({ total: "9.99", totalCents: null });
    await runBackfill("order-total-cents");

    await expectCount(orderTable, 1, { totalCents: null });
  });

  it("updates a batch in one query", async () => {
    await orderFactory.count(20)({ total: "12.50", totalCents: null });

    await expectQueryCount({ max: 9 }, () => runBackfill("order-total-cents"));
  });
});
```

- The first test has one old order and one new order. Only the old order matches `where`, so the backfill processes one row and leaves the other as it was.
- The second test shows the rule of the last section. Once the backfill completed, a second run does nothing, and a row without cents stays empty.
- The third test sets a budget of queries for 20 orders.

The loop version fails the budget:

```
Error: expectQueryCount: the app ran 28 queries, over the budget of 9
```

The backfill itself runs 8 queries for its bookkeeping. It counts the rows, writes and locks its progress row, reads each batch, moves the cursor and marks the end. The loop adds one `UPDATE` for each row, here 20. With 1,000 rows in a batch, that is 1,000 round trips in one transaction. Update the whole batch in one statement, and let Postgres compute the cents:

```ts
// server/database/backfills/order-total-cents.backfill.ts
import { inArray, isNull, sql } from "drizzle-orm";
import { orderTable } from "#nuxvel/schema";

export const orderTotalCentsBackfill = defineBackfill({
  table: orderTable,
  batchSize: 1_000,
  where: isNull(orderTable.totalCents),
  async handler(rows) {
    await useDb()
      .update(orderTable)
      .set({ totalCents: sql`round(${orderTable.total} * 100)` })
      .where(inArray(orderTable.id, rows.map((row) => row.id)));
  },
});
```

The count is now 9 for any number of rows in a batch: the 8 queries of the bookkeeping and one `UPDATE`. The test passes with `{ max: 9 }`.

### Run the backfill

Apply the expand migration. Then run the backfill from tinker. In production, run it from `nuxvel tinker production`, a job or a Nitro task. See [Running a backfill](../backfills.md#running-a-backfill).

```bash
./nv db:migrate
./nv tinker
```

```
nuxvel> await runBackfill("order-total-cents")
```

```bash
./nv backfill:status
```

```
NAME               ROWS  CURSOR  STATE
order-total-cents  2/2   2       done
```

The dev database has the two orders of chapter 7, both without cents. The backfill filled them and stored the ID of the last row as its cursor. On a large table, `backfill:status` shows the rows so far, and a run that you stop continues from `CURSOR`.

### Contract

The next release reads only `total_cents`. Make the column `NOT NULL` and delete `total` from the schema:

```ts
// server/database/schema/order.schema.ts
import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { timestamps } from "@nuxvel/nuxt/database";
import { userTable } from "./auth.schema";
import { productTable } from "./product.schema";

export const orderTable = pgTable("order", {
  id: serial("id").primaryKey(),
  buyerId: text("buyer_id").notNull().references(() => userTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => productTable.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull(),
  totalCents: integer("total_cents").notNull(),
  confirmationSentAt: timestamp("confirmation_sent_at"),
  ...timestamps(),
}, (table) => [index("order_buyer_id_idx").on(table.buyerId), index("order_product_id_idx").on(table.productId)]);

export type OrderRow = typeof orderTable.$inferSelect;
export type NewOrderRow = typeof orderTable.$inferInsert;
```

The mail and the invoicing service still take a decimal string. Add a helper in `shared/utils/`. Nuxt imports it on the server and in the browser:

```ts
// shared/utils/money.ts
export function formatCents(cents: number) {
  return (cents / 100).toFixed(2);
}
```

Then change each read and write of `total`. `nuxt typecheck` lists each place that still uses it:

```ts
// server/actions/order/place-order.action.ts
      .values({ buyerId: ctx.actor.id, productId, quantity, totalCents: product.priceCents * quantity })

// server/listeners/order/record-sale.listener.ts
        revenueCents: order.totalCents,

// server/listeners/order/send-confirmation.listener.ts
        total: formatCents(order.totalCents),

// server/jobs/invoice/issue.job.ts
      body: { reference: `order-${order.id}`, email: buyer.email, total: formatCents(order.totalCents) },

// server/trpc/routers/order.router.ts
          totalCents: orderTable.totalCents,

// shared/schemas/order.ts
  totalCents: z.number(),

// server/factories/order.factory.ts
  totalCents: () => faker.number.int({ min: 100, max: 9_900 }),
```

```vue
<!-- app/components/OrderList.vue -->
      <span>Order #{{ order.id }}: {{ order.quantity }} × {{ order.productName }}, ${{ formatCents(order.totalCents) }}</span>
```

In the tests and the story, replace each `total: "25.00"` of an order with `totalCents: 2500`, and the other decimal totals in the same way. The action test checks `expect(order.totalCents).toBe(2500)`. The mail test keeps its `total`, because the mail input did not change.

The backfill reads `orderTable.total`, which no longer exists. Its work is done, so delete it and its test:

```bash
rm server/database/backfills/order-total-cents.backfill.ts server/database/backfills/order-total-cents.backfill.test.ts
```

Generate the migration:

```bash
./nv db:generate --name order-drop-total
```

```
▲ Moved 2 breaking statements to contract/0019_order-drop-total.sql
  → A deploy runs it once no older release runs. A rename or a type change breaks the new release until then: add a column and backfill it instead
    ALTER TABLE "order" ALTER COLUMN "total_cents" SET NOT NULL
    ALTER TABLE "order" DROP COLUMN "total"
```

```sql
-- server/database/migrations/contract/0019_order-drop-total.sql
ALTER TABLE "order" ALTER COLUMN "total_cents" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "order" DROP COLUMN "total";
```

`db:generate` moved both statements to a contract migration, and left `0019_order-drop-total.sql` empty. A deploy runs a contract migration only when no older release runs, so no running code reads `total` when it goes. See [Database: contract migrations](../database.md#contract-migrations).

The order of the two statements is also a guard. A contract migration runs in one transaction. When a row still has no cents, Postgres refuses `SET NOT NULL`, and the transaction rolls back before the `DROP`. So an unfinished backfill makes the migration fail, and no total is lost.

Apply it in development:

```bash
./nv db:migrate
```

```
◇ Applied 2 migrations (27ms)
│    0019_order-drop-total
│    contract/0019_order-drop-total
```

The tests need no change for the migrations. The test setup builds a new database from all the migrations. On a new database, each contract migration runs right after its own migration.

## 12. Run every test layer

```bash
npm run typecheck
npm run test:functional
npm run test:ui
npm run test:e2e
npm run test:arch
```

```
 Test Files  12 passed (12)
      Tests  28 passed (28)
```

```
✔ All architecture rules pass
```

The functional run has the generated factory tests, the starter's tests and the tests of this tutorial. `npm test` runs `test:functional`, then `test:ui`. It does not run the browser tests.

| Check | Layer | File |
|---|---|---|
| The stock goes down with the order, and the follow-up work reaches the queue after the commit | Functional | `server/actions/order/place-order.action.test.ts` |
| A stock conflict keeps no order, no stock change and no outbox row | Functional | `server/actions/order/place-order.action.test.ts` |
| A row that a stopped process left in the outbox reaches the queue | Functional | `server/actions/order/place-order.action.test.ts` |
| The whole chain ends with a sale, a mail and an invoice | Functional | `server/actions/order/place-order.action.test.ts` |
| The event runs the sync listener and queues the others, and refuses a bad payload | Functional | `server/events/order/placed.event.test.ts` |
| A listener that runs two times writes one sale and sends one mail | Functional | `server/listeners/order/*.listener.test.ts` |
| A sale goes on the day of the order, not the day of the run | Functional | `server/listeners/order/record-sale.listener.test.ts` |
| The invoice job retries a down service and fails a refused order at once | Functional | `server/jobs/invoice/issue.job.test.ts` |
| A second request for an invoice adds no second job | Functional | `server/actions/invoice/request-invoice.action.test.ts` |
| The order list runs the same queries for any number of orders | Functional | `server/trpc/routers/order.router.test.ts` |
| The backfill fills the old rows in one query for each batch | Functional | `server/database/backfills/order-total-cents.backfill.test.ts`, until the contract |
| The order list shows an invoice or "Invoice pending" | Component | `app/components/OrderList.stories.ts` |
| A buyer orders, sees the stock conflict, then sees the invoice | End-to-end | `tests/e2e/shop.test.ts` |

## What this tutorial leaves out

- The orders page does not update itself when the invoice arrives. A broadcast from the job and `useLiveQuery()` do that. See [Realtime](../realtime.md).
- Nothing cancels an order. A cancel needs its own event, and the listeners must give the stock back and mark the sale, again safe to run two times.
- The event payload has one version. When you change it while payloads wait on the queue, add an upcaster. See [Domain events: versioning a payload](../events.md#versioning-a-payload).
- The invoice job calls the service with no rate limit. A service with a limit needs `limiter` and its own queue. See [Queues: job options](../queues.md#job-options).
- No page calls `request-invoice` yet.
