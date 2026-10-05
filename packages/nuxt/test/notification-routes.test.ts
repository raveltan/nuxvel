import { actingAs, expect, guest } from "@nuxvel/nuxt/testing";
import { afterEach, describe, it } from "vitest";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { closeChannelStreams, openChannelStream } from "./helpers/channel-stream";
import { setupPlayground } from "./helpers/playground";
import { sessionCookie } from "./helpers/session-cookie";

interface Listed {
  unreadCount: number;
  notifications: { id: string; name: string; data: { title: string }; readAt: string | null }[];
}

describe("the notification routes and channel", async () => {
  await setupPlayground();

  afterEach(() => closeChannelStreams());

  it("refuses a guest", async () => {
    const list = await guest().fetch("/api/notifications");
    const read = await guest().fetch("/api/notifications/read", { method: "POST", body: "{}" });
    const channel = await openChannelStream("notifications:someone");

    expect([list.status, read.status, channel.response.status]).toEqual([401, 401, 403]);
  });

  it("lists a user's notifications, marks one and then all read, and announces each change on the user's channel only", async () => {
    const ada = await userFactory();
    const bob = await userFactory();
    const asAda = actingAs(ada);
    const headers = { cookie: await sessionCookie(asAda) };

    const stream = await openChannelStream(`notifications:${ada.id}`, headers);
    const othersChannel = await openChannelStream(`notifications:${bob.id}`, headers);

    expect(await stream.next()).toEqual({ event: "connected", data: "{}" });
    expect(othersChannel.response.status).toBe(403);

    await guest().$fetch("/api/_notify-send", { query: { userId: ada.id, name: "One" } });
    await guest().$fetch("/api/_notify-send", { query: { userId: ada.id, name: "Two" } });
    await guest().$fetch("/api/_notify-send", { query: { userId: bob.id, name: "Bob" } });

    expect(await stream.next()).toMatchObject({ data: JSON.stringify({ event: "changed", payload: {} }) });

    const listed = await asAda.$fetch<Listed>("/api/notifications");

    expect(listed.unreadCount).toBe(2);
    expect(listed.notifications.map((row) => row.data.title)).toEqual(["Welcome, Two", "Welcome, One"]);

    const [newest] = listed.notifications;
    const one = await asAda.$fetch("/api/notifications/read", { method: "POST", body: { id: newest?.id } });

    expect(one).toEqual({ unreadCount: 1 });

    const all = await asAda.$fetch("/api/notifications/read", { method: "POST", body: {} });
    const after = await asAda.$fetch<Listed>("/api/notifications");

    expect(all).toEqual({ unreadCount: 0 });
    expect(after.notifications.every((row) => row.readAt !== null)).toBe(true);
    expect((await actingAs(bob).$fetch<Listed>("/api/notifications")).unreadCount).toBe(1);
  });
});
