import { createECDH, randomUUID } from "node:crypto";
import { describe, it } from "vitest";
import { createPage, url } from "@nuxt/test-utils/e2e";
import { actingAs, expect, expectRow, guest } from "@nuxvel/nuxt/testing";
import { pushSubscriptionsTable } from "../../../playground/server/database/schema/push-subscriptions.schema";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

const vapid = createECDH("prime256v1");
vapid.generateKeys();

const endpoint = `https://fcm.googleapis.com/fcm/send/${randomUUID()}`;

describe("web push, client side", async () => {
  await setupPlayground({
    browser: true,
    // chromium-headless-shell refuses showNotification() even with the permission granted
    browserOptions: { type: "chromium", launch: { channel: "chromium" } },
    env: { NUXT_PUBLIC_PUSH_VAPID_PUBLIC_KEY: vapid.getPublicKey("base64url") },
  });

  it("keeps the strict CSP, which already allows the manifest and the service worker", async () => {
    const policy = (await guest().fetch("/")).headers.get("content-security-policy");

    expect(policy).toContain("default-src 'none';");
    expect(policy).toContain("manifest-src 'self';");
    expect(policy).toContain("worker-src 'self';");
  });

  it("subscribes from <PushToggle>, stores the subscription and shows a pushed notification", async () => {
    const page = await createPage();
    const origin = new URL(url("/")).origin;

    await page.context().grantPermissions(["notifications"], { origin });
    // headless Chromium has no push service to subscribe with, so the browser's subscribe() answers with a fixed endpoint
    await page.addInitScript((fakeEndpoint) => {
      PushManager.prototype.subscribe = async () => {
        const keys = { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" };
        return { endpoint: fakeEndpoint, toJSON: () => ({ endpoint: fakeEndpoint, keys }) } as unknown as PushSubscription;
      };
    }, endpoint);
    await actingAs(await userFactory({ email: `push-client-${randomUUID()}@example.com` })).login(page);
    await page.goto(url("/profile"), { waitUntil: "hydration" });

    await page.getByRole("switch", { name: "Push notifications" }).click();
    await expect
      .poll(() => page.getByRole("switch", { name: "Push notifications" }).getAttribute("aria-checked"), { timeout: 15_000 })
      .toBe("true");

    await expectRow(pushSubscriptionsTable, { endpoint });

    const cdp = await page.context().newCDPSession(page);
    const registrationId = new Promise<string>((resolve) => {
      cdp.on("ServiceWorker.workerRegistrationUpdated", ({ registrations }) => {
        const registration = registrations.find((candidate) => candidate.scopeURL === `${origin}/`);
        if (registration) resolve(registration.registrationId);
      });
    });
    await cdp.send("ServiceWorker.enable");
    const deliver = async () =>
      cdp.send("ServiceWorker.deliverPushMessage", {
        origin,
        registrationId: await registrationId,
        data: JSON.stringify({ title: "New comment", body: "Ada commented", url: "/posts/1", tag: "c1" }),
      });

    await expect
      .poll(
        async () => {
          await deliver();
          return page.evaluate(async () => {
            const registration = await navigator.serviceWorker.ready;
            return (await registration.getNotifications()).map(({ title, body, tag, data }) => ({ title, body, tag, data }));
          });
        },
        { timeout: 15_000 },
      )
      .toEqual([{ title: "New comment", body: "Ada commented", tag: "c1", data: { url: "/posts/1" } }]);

    await page.close();
  }, 60_000);

  it("stores the browser's subscription again when <PushToggle> mounts for a signed-in user", async () => {
    const page = await createPage();
    const existing = `https://fcm.googleapis.com/fcm/send/${randomUUID()}`;

    await page.context().grantPermissions(["notifications"], { origin: new URL(url("/")).origin });
    await page.addInitScript((fakeEndpoint) => {
      PushManager.prototype.getSubscription = async () => {
        const keys = { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" };
        return { endpoint: fakeEndpoint, toJSON: () => ({ endpoint: fakeEndpoint, keys }) } as unknown as PushSubscription;
      };
    }, existing);
    await actingAs(await userFactory({ email: `push-client-${randomUUID()}@example.com` })).login(page);
    await page.goto(url("/profile"), { waitUntil: "hydration" });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.goto(url("/profile"), { waitUntil: "hydration" });

    await expectRow(pushSubscriptionsTable, { endpoint: existing });

    await page.close();
  }, 60_000);
});
