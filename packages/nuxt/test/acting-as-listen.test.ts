import { actingAs, expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

function send(channel: string, event: string, n: number) {
  return guest().$fetch("/api/_broadcast-check", { method: "POST", body: { channel, event, payload: { n } } });
}

describe("client.listen(channels)", async () => {
  await setupPlayground();

  let opened: Awaited<ReturnType<ReturnType<typeof guest>["listen"]>> | undefined;

  it("rejects a refused guest with FORBIDDEN and an unknown channel with NOT_FOUND", async () => {
    await expect(guest().listen("_probe-members")).rejects.toBeTrpcError("FORBIDDEN");
    await expect(guest().listen("_no-such-channel")).rejects.toBeTrpcError("NOT_FOUND");
  });

  it("lets a member listen and delivers a broadcast", async () => {
    const stream = await actingAs(await userFactory()).listen(["_probe-members", "_probe-admins"]);

    opened = stream;
    expect(stream.channels).toContain("_probe-members");

    await send("_probe-members", "pinged", 1);

    expect(await stream.next()).toEqual({ id: expect.any(String), event: "pinged", payload: { n: 1 } });
  });

  it("replays the events after the last event id on a new connection", async () => {
    const user = await userFactory();
    const first = await actingAs(user).listen("_probe-members");

    await send("_probe-members", "first", 1);
    await send("_probe-members", "second", 2);

    const seen = await first.next();

    first.close();

    const again = await actingAs(user).listen("_probe-members", { lastEventId: seen.id });
    const replayed = await again.next();

    expect(replayed).toEqual({ id: expect.any(String), event: "second", payload: { n: 2 } });
    expect(replayed.id).not.toBe(seen.id);
  });

  it("lists the refused channels of a guest that may listen to some", async () => {
    const stream = await guest().listen(["_probe-public", "_probe-members"]);

    expect(stream.channels).toEqual(["_probe-public"]);
    expect(stream.refused).toEqual(["_probe-members"]);
  });

  it("skips the presence events when next() names an event", async () => {
    const stream = await actingAs(await userFactory()).listen("posts?id=1");

    await actingAs(await userFactory()).listen("posts?id=1");
    await send("posts?id=1", "created", 1);

    expect(await stream.next("created")).toEqual({ id: expect.any(String), event: "created", payload: { n: 1 } });
  });

  it("closes the stream of an earlier test", async () => {
    await expect(opened?.next()).rejects.toThrow();
  });
});
