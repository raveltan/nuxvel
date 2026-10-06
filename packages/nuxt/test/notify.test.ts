import { describe, it } from "vitest";
import { expect, expectMailSent, expectNoMailSent, expectNotified, expectNotNotified, expectNotQueued, expectPushSent, expectQueued, expectRow, fakePush, guest, runAction, runJob, sendNotification } from "@nuxvel/nuxt/testing";
import { $notifications } from "#nuxvel/test-namespaces";
import { notificationsTable } from "../../../playground/server/database/schema/notifications.schema";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

describe("notify()", async () => {
  await setupPlayground();

  it("writes the database row, records the notification and mails the user through the nuxvel.notification job", async () => {
    const ada = await userFactory({ name: "Ada" });

    await runAction("profile.send-test-notification", {}, { actingAs: ada });

    const row = await expectRow(notificationsTable, { userId: ada.id, name: "welcome", readAt: null });

    expect(row.data).toEqual({
      title: "Welcome, Ada",
      body: "Thanks for signing up.",
      url: "/profile",
      icon: "i-lucide-party-popper",
    });
    await expectNotified(ada, "welcome", { title: "Welcome, Ada" });
    await expectQueued("nuxvel.notification", {
      userIds: [ada.id],
      mail: { mail: "welcome", data: { name: "Ada" } },
    });
    await expectNoMailSent("welcome");

    await runJob("nuxvel.notification", { userIds: [ada.id], mail: { mail: "welcome", data: { name: "Ada" } } });

    await expectMailSent("welcome", { to: ada.email, name: "Ada" });
  });

  it("feeds the database row, the push and the mail's input from one message", async () => {
    const ada = await userFactory({ name: "Ada" });
    const message = { title: "Hello, Ada", body: "One message for every channel.", url: "/profile" };

    await sendNotification(ada, $notifications._update, { name: "Ada" });

    const row = await expectRow(notificationsTable, { userId: ada.id, name: "_update" });
    expect(row.data).toEqual(message);
    await expectPushSent(ada, message);
    await expectQueued("nuxvel.notification", { userIds: [ada.id], mail: { mail: "_update", data: message } });

    await runJob("nuxvel.notification", { userIds: [ada.id], mail: { mail: "_update", data: message } });

    await expectMailSent("_update", { to: ada.email, ...message });
  });

  it("sends the push through sendPush, and the nuxvel.push job skips a user with no subscribed device", async () => {
    const ada = await userFactory({ name: "Ada" });

    await runAction("profile.send-test-notification", {}, { actingAs: ada });

    await expectPushSent(ada, { title: "Welcome, Ada", body: "Thanks for signing up.", url: "/profile" });

    await runJob("nuxvel.push", { userIds: [ada.id], notification: { title: "Welcome, Ada", body: "Thanks for signing up." } });

    expect(await fakePush.delivered()).toEqual([]);
  });

  it("takes a notification's $notifications stub in place of its name", async () => {
    const ada = await userFactory();
    const grace = await userFactory();

    await sendNotification(ada, $notifications.welcome, { name: "Ada" });

    await expectNotified(ada, $notifications.welcome, { title: "Welcome, Ada" });
    await expect(expectNotNotified(ada, $notifications.welcome)).rejects.toThrow();
    await expectNotNotified(grace, $notifications.welcome);
  });

  it("rejects a name no notification has", async () => {
    const ada = await userFactory();

    // @ts-expect-error the runtime check behind the compile-time one
    await expect(sendNotification(ada, "goodbye", {})).rejects.toThrow('No notification is named "goodbye"');
  });

  it("notifies nobody from a rolled-back transaction and rejects invalid data given the notification's definition", async () => {
    const ada = await userFactory();

    const { invalid } = await guest().$fetch("/api/_notify-check", { query: { userId: ada.id } });

    expect(invalid).toBe(true);
    await expectNotNotified(ada, "welcome");
    await expectNotQueued("nuxvel.notification");
    await expectNotQueued("nuxvel.push");
  });
});

