import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, it } from "vitest";
import { actingAs, expect, expectPushSent, expectRow, fakePush, guest, runJob, type TestClient } from "@nuxvel/nuxt/testing";
import { sessionTable } from "../../../playground/server/database/schema/auth.schema";
import { pushSubscriptionsTable } from "../../../playground/server/database/schema/push-subscriptions.schema";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { useTestDatabase } from "./helpers/database";
import { setupPlayground } from "./helpers/playground";

function subscription() {
  return {
    endpoint: `https://fcm.googleapis.com/fcm/send/${randomUUID()}`,
    keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" },
  };
}

function subscribe(send: TestClient["fetch"], body: unknown, method = "POST") {
  return send("/api/push/subscribe", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("web push, server side", async () => {
  await setupPlayground();

  const db = useTestDatabase();

  it("stores a subscription for the signed-in user, refuses a guest and a URL that is no push service", async () => {
    const user = await userFactory({ email: `push-${randomUUID()}@example.com` });
    const { fetch: signedIn } = actingAs(user);
    const device = subscription();

    expect((await subscribe(guest().fetch, device)).status).toBe(401);
    expect((await subscribe(signedIn, { ...device, endpoint: "https://internal.example.com/hook" })).status).toBe(400);
    expect((await subscribe(signedIn, device)).status).toBe(200);

    await expectRow(pushSubscriptionsTable, { userId: user.id, endpoint: device.endpoint, auth: device.keys.auth });
  });

  it("deletes the signed-in user's subscription", async () => {
    const { fetch: signedIn } = actingAs(await userFactory({ email: `push-${randomUUID()}@example.com` }));
    const device = subscription();

    await subscribe(signedIn, device);
    expect((await subscribe(signedIn, { endpoint: device.endpoint }, "DELETE")).status).toBe(200);

    expect(await db.select().from(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.endpoint, device.endpoint))).toEqual([]);
  });

  it("rate limits subscribing to 10 a minute per user", async () => {
    const { fetch: signedIn } = actingAs(await userFactory({ email: `push-${randomUUID()}@example.com` }));
    const statuses: number[] = [];

    for (let attempt = 0; attempt < 11; attempt++) statuses.push((await subscribe(signedIn, subscription())).status);

    expect(statuses.slice(0, 10).every((status) => status === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it("records a committed sendPush and not a rolled-back one", async () => {
    const { id: userId } = await userFactory({ email: `push-${randomUUID()}@example.com` });

    await guest().$fetch("/api/_send-push-check", {
      method: "POST",
      body: { userId, title: "New comment", rolledBackTitle: "Rolled back" },
    });

    await expectPushSent({ id: userId }, { title: "New comment", url: "/posts/1" });
    await expect(expectPushSent({ id: userId }, { title: "Rolled back" })).rejects.toThrow();
  });

  it("delivers to each subscription of the user and deletes one its push service reports gone", async () => {
    const user = await userFactory({ email: `push-${randomUUID()}@example.com` });
    const { fetch: signedIn } = actingAs(user);
    const phone = subscription();
    const laptop = subscription();

    await subscribe(signedIn, phone);
    await subscribe(signedIn, laptop);
    await fakePush.gone(laptop.endpoint);

    await runJob("nuxvel.push", { userIds: [user.id], notification: { title: "New comment", body: "Hi", tag: "c1" } });

    expect(await fakePush.delivered()).toEqual([
      { endpoint: phone.endpoint, notification: { title: "New comment", body: "Hi", tag: "c1" } },
    ]);
    await expectRow(pushSubscriptionsTable, { endpoint: phone.endpoint });
    expect(await db.select().from(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.endpoint, laptop.endpoint))).toEqual([]);
  });

  it("accepts only the exact push-service hosts, and the push job deletes a stored endpoint on another host without sending to it", async () => {
    const user = await userFactory({ email: `push-${randomUUID()}@example.com` });
    const userId = user.id;
    const { fetch: signedIn } = actingAs(user);
    const phone = subscription();
    const smuggled = { ...subscription(), endpoint: `https://127.0.0.1;fcm.googleapis.com/fcm/send/${randomUUID()}` };

    for (const endpoint of [
      smuggled.endpoint,
      `https://127.0.0.1:8443;fcm.googleapis.com/fcm/send/${randomUUID()}`,
      `https://storage.googleapis.com/bucket/${randomUUID()}`,
      `https://fcm.googleapis.com:8443/fcm/send/${randomUUID()}`,
    ]) {
      expect((await subscribe(signedIn, { ...phone, endpoint })).status).toBe(400);
    }

    for (const endpoint of [
      `https://updates.push.services.mozilla.com/wpush/v2/${randomUUID()}`,
      `https://web.push.apple.com/${randomUUID()}`,
      `https://wns2-par02p.notify.windows.com/w/?token=${randomUUID()}`,
    ]) {
      expect((await subscribe(signedIn, { ...phone, endpoint })).status).toBe(200);
    }

    await subscribe(signedIn, phone);
    const [session] = await db.select().from(sessionTable).where(eq(sessionTable.userId, userId));
    await db.insert(pushSubscriptionsTable).values({ userId, sessionId: session?.id, endpoint: smuggled.endpoint, p256dh: smuggled.keys.p256dh, auth: smuggled.keys.auth });

    await runJob("nuxvel.push", { userIds: [userId], notification: { title: "New comment", body: "Hi" } });

    expect((await fakePush.delivered()).map((push) => push.endpoint)).not.toContain(smuggled.endpoint);
    expect((await fakePush.delivered()).map((push) => push.endpoint)).toContain(phone.endpoint);
    expect(await db.select().from(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.endpoint, smuggled.endpoint))).toEqual([]);
    await expectRow(pushSubscriptionsTable, { endpoint: phone.endpoint });
  });

  it("ends the push of a device when its session is revoked or has expired, and restores it when the device subscribes again", async () => {
    const user = await userFactory({ email: `push-${randomUUID()}@example.com` });
    const userId = user.id;
    const onPhone = actingAs(user);
    const onLaptop = actingAs(user);
    const onTablet = actingAs(user);
    const phone = subscription();
    const laptop = subscription();
    const tablet = subscription();

    await subscribe(onPhone.fetch, phone);
    await subscribe(onLaptop.fetch, laptop);
    await subscribe(onTablet.fetch, tablet);

    const { sessionId: tabletSessionId } = await expectRow(pushSubscriptionsTable, { endpoint: tablet.endpoint });
    await db.update(sessionTable).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(sessionTable.id, tabletSessionId ?? ""));
    expect(
      (await onLaptop.fetch("/api/auth/revoke-other-sessions", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status,
    ).toBe(200);

    await runJob("nuxvel.push", { userIds: [userId], notification: { title: "New comment", body: "Hi" } });

    expect((await fakePush.delivered()).map((push) => push.endpoint)).toEqual([laptop.endpoint]);
    expect(await db.select().from(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.endpoint, phone.endpoint))).toEqual([]);

    await subscribe(onLaptop.fetch, phone);
    await runJob("nuxvel.push", { userIds: [userId], notification: { title: "New comment", body: "Hi" } });

    expect((await fakePush.delivered()).map((push) => push.endpoint)).toContain(phone.endpoint);
  });
});
