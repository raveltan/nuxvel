import { url } from "@nuxt/test-utils/e2e";
import { describe, it } from "vitest";
import { billingSubscriptionsTable } from "@nuxvel/nuxt/database";
import { actingAs, button, completeCheckout, expect, expectNotSubscribed, expectRow, expectSubscribed, fakeStripe, heading } from "@nuxvel/nuxt/testing";
import { $products } from "#nuxvel/test-namespaces";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

describe("the test Checkout and Customer Portal pages", async () => {
  await setupPlayground({ browser: true });

  it("lets the user pay on the test Checkout page, then sends them to the success URL", { timeout: 30_000 }, async () => {
    const user = await userFactory();
    const page = await actingAs(user).visit("/");

    await page.goto(url("/api/_billing-start?product=_pro"), { waitUntil: "load" });
    await expect(heading(page, "Test checkout")).toBeVisible();
    await button(page, "Pay").click();
    await page.waitForURL(/\/\?paid=cs_test_/);

    await expectSubscribed(user, $products._pro);
  });

  it("pays at once with checkout: 'pay', and sends the user back to the cancel URL with checkout: 'decline'", { timeout: 30_000 }, async () => {
    const user = await userFactory();
    const page = await actingAs(user).visit("/");

    await fakeStripe({ checkout: "decline" });
    await page.goto(url("/api/_billing-start?product=_pro"), { waitUntil: "load" });
    await page.waitForURL(/\/\?canceled=1/);
    await expectNotSubscribed(user, $products._pro);

    await fakeStripe({ checkout: "pay" });
    await page.goto(url("/api/_billing-start?product=_pro"), { waitUntil: "load" });
    await page.waitForURL(/\/\?paid=cs_test_/);
    await expectSubscribed(user, $products._pro);
  });

  it("cancels a subscription on the test Customer Portal page, at the end of the period", { timeout: 30_000 }, async () => {
    const user = await userFactory();
    await completeCheckout(user, $products._pro);
    const page = await actingAs(user).visit("/");

    await page.goto(url("/api/_billing-portal-start"), { waitUntil: "load" });
    await expect(heading(page, "Test billing portal")).toBeVisible();
    await button(page, "Cancel subscription").click();
    await page.waitForURL(/\/\?portal=1/);

    await expectRow(billingSubscriptionsTable, { userId: user.id, status: "active", cancelAtPeriodEnd: true });
  });
});
