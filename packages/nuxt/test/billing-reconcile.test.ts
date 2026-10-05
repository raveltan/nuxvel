import { describe, it } from "vitest";
import { billingEventsTable } from "@nuxvel/nuxt/database";
import { expect, expectCount, expectNotSubscribed, expectQueued, expectSubscribed, guest, runJob, runSchedule } from "@nuxvel/nuxt/testing";
import { $products } from "#nuxvel/test-namespaces";
import { testDatabase } from "../src/testing/database";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

describe("the daily billing reconcile", async () => {
  await setupPlayground();

  it("stores and processes the events of the last 30 days that the webhook missed, once", async () => {
    const user = await userFactory();
    await guest().$fetch("/api/_billing-missed-check", { method: "POST", body: { user: { id: user.id, email: user.email } } });
    await expectNotSubscribed(user, $products._pro);

    await runSchedule("nuxvel.billing.reconcile");

    await expectCount(billingEventsTable, 2);
    const events = await testDatabase().select().from(billingEventsTable);
    for (const event of events) {
      await expectQueued("nuxvel.billing.process-event", { eventId: event.id });
      await runJob("nuxvel.billing.process-event", { eventId: event.id });
    }
    await expectSubscribed(user, $products._pro);

    await runSchedule("nuxvel.billing.reconcile");

    await expectCount(billingEventsTable, 2);
    await expectQueued("nuxvel.billing.process-event", {}, { times: 2 });
    expect(events.map((event) => event.type).sort()).toEqual(["checkout.session.completed", "customer.subscription.created"]);
  });
});
