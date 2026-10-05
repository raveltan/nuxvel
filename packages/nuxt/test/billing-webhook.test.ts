import { randomUUID } from "node:crypto";
import { describe, it } from "vitest";
import { billingEventsTable } from "@nuxvel/nuxt/database";
import { deliverWebhook, expect, expectNoRow, expectNotQueued, expectQueued, expectRow, runJob } from "@nuxvel/nuxt/testing";
import { testDatabase } from "../src/testing/database";
import { setupPlayground } from "./helpers/playground";

function stripeEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: `evt_${randomUUID().replaceAll("-", "")}`,
    object: "event",
    type: "customer.subscription.updated",
    created: 1_790_000_000,
    livemode: false,
    data: { object: { id: "sub_test_1", object: "subscription", status: "active" } },
    ...overrides,
  };
}

describe("the Stripe webhook", async () => {
  await setupPlayground();

  it("stores a signed event once and queues its processing after commit", async () => {
    const event = stripeEvent();

    const response = await deliverWebhook("stripe", event);

    expect(response.status).toBe(200);
    await expectRow(billingEventsTable, {
      id: event.id,
      type: "customer.subscription.updated",
      objectId: "sub_test_1",
      livemode: false,
      stripeCreatedAt: new Date(1_790_000_000 * 1000),
      processedAt: null,
      attempts: 0,
    });
    await expectQueued("nuxvel.billing.process-event", { eventId: event.id }, { times: 1 });

    expect((await deliverWebhook("stripe", event)).status).toBe(200);
    await expectQueued("nuxvel.billing.process-event", { eventId: event.id }, { times: 1 });
  });

  it("queues nothing for an event that is already stored, even once Redis forgot its delivery", async () => {
    const event = stripeEvent();

    await testDatabase().insert(billingEventsTable).values({ id: event.id, type: event.type, livemode: false, stripeCreatedAt: new Date() });

    expect((await deliverWebhook("stripe", event)).status).toBe(200);
    await expectNotQueued("nuxvel.billing.process-event", { eventId: event.id });
  });

  it("refuses a live event while the key is a test key", async () => {
    const event = stripeEvent({ livemode: true });

    const response = await deliverWebhook("stripe", event);

    expect(response.status).toBe(400);
    expect(await response.text()).toContain("livemode does not match NUXT_STRIPE_SECRET_KEY");
    await expectNoRow(billingEventsTable, { id: event.id });
  });

  it("marks an event processed once, however often its job runs", async () => {
    const event = stripeEvent({ type: "customer.created", data: { object: { id: "cus_test_1", object: "customer" } } });

    await deliverWebhook("stripe", event);
    await runJob("nuxvel.billing.process-event", { eventId: event.id });
    const { processedAt } = await expectRow(billingEventsTable, { id: event.id, attempts: 1, lastError: null });

    await runJob("nuxvel.billing.process-event", { eventId: event.id });

    expect(processedAt).toBeInstanceOf(Date);
    await expectRow(billingEventsTable, { id: event.id, attempts: 1, processedAt });
  });
});
