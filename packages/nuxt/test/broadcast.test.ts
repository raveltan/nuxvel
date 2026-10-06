import { Redis } from "ioredis";
import { afterEach, describe, it } from "vitest";
import { actingAs, expect, guest } from "@nuxvel/nuxt/testing";
import { userFactory } from "../../../playground/server/factories/users.factory";
import {
  closeChannelStreams,
  openChannelStream,
} from "./helpers/channel-stream";
import { setupPlayground } from "./helpers/playground";
import { sessionCookie } from "./helpers/session-cookie";

async function openCount(channel: string) {
  const { open } = await guest().$fetch<{ open: number }>("/api/_open-streams-check", {
    query: { channel },
  });

  return open;
}

async function redisSubscribers(channel: string) {
  const redis = new Redis(process.env.NUXT_REDIS_URL ?? "");

  try {
    const topic = `nuxvel:channel:${redis.options.db ?? 0}:${channel}`;
    const reply = await redis.call("PUBSUB", "NUMSUB", topic);

    return Array.isArray(reply) ? Number(reply[1]) : Number.NaN;
  } finally {
    await redis.quit();
  }
}

function moveCard(card: number, boardId?: number, afterCommit?: boolean) {
  return guest().$fetch("/api/_room-broadcast-check", { method: "POST", body: { card, boardId, afterCommit } });
}

async function listening(name: string, headers: Record<string, string> = {}) {
  const stream = await openChannelStream(name, headers);

  expect(await stream.next()).toEqual({ event: "connected", data: "{}" });

  return stream;
}

describe("broadcast()", async () => {
  await setupPlayground();

  afterEach(() => closeChannelStreams());

  it("sends a declared event's validated payload given the channel's definition and rejects one that fails its schema", async () => {
    const stream = await listening("_probe-public");

    expect(await guest().$fetch("/api/_typed-broadcast-check")).toEqual({ rejected: true });
    expect(await stream.next()).toEqual({
      event: "message",
      data: JSON.stringify({ event: "renamed", payload: { id: 1 } }),
      id: expect.stringMatching(/^\d+-\d+$/),
    });
    expect(await stream.next(300)).toBe("timeout");
  });

  it("sends an event from a broadcast() in a transaction only once it commits, and rejects a payload that fails the schema at the call", async () => {
    const stream = await listening("_probe-public");

    expect(await guest().$fetch("/api/_broadcast-after-commit-check")).toEqual({ rejected: true });
    expect(await stream.next()).toEqual({
      event: "message",
      data: JSON.stringify({ event: "renamed", payload: { id: 2 } }),
      id: expect.stringMatching(/^\d+-\d+$/),
    });
    expect(await stream.next(300)).toBe("timeout");
  });

  it("reaches every connection on the channel and none on another", async () => {
    const cookie = await sessionCookie(actingAs(await userFactory()));
    const first = await listening("_probe-public");
    const second = await listening("_probe-public");
    const elsewhere = await listening("_probe-members", { cookie });

    await guest().$fetch("/api/_broadcast-check", {
      method: "POST",
      body: { channel: "_probe-public", event: "pinged", payload: { count: 1 } },
    });

    const expected = {
      event: "message",
      data: JSON.stringify({ event: "pinged", payload: { count: 1 } }),
      id: expect.stringMatching(/^\d+-\d+$/),
    };

    expect(await first.next()).toEqual(expected);
    expect(await second.next()).toEqual(expected);
    expect(await elsewhere.next(300)).toBe("timeout");
  });

  it("stops reaching a connection once it closes", async () => {
    const leaving = await listening("_probe-public");
    const staying = await listening("_probe-public");

    leaving.close();

    await expect(
      guest().$fetch("/api/_broadcast-check", {
        method: "POST",
        body: { channel: "_probe-public", event: "pinged", payload: null },
      }),
    ).resolves.toEqual({ broadcast: true });
    expect(await staying.next()).toEqual({
      event: "message",
      data: JSON.stringify({ event: "pinged", payload: null }),
      id: expect.stringMatching(/^\d+-\d+$/),
    });
  });

  it("forgets a connection once its client disconnects", async () => {
    const leaving = await listening("_probe-public");

    await expect.poll(() => openCount("_probe-public")).toBe(1);

    leaving.close();

    await expect.poll(() => openCount("_probe-public")).toBe(0);
  });

  it("unsubscribes from Redis once a channel's last connection closes, and resubscribes for the next", async () => {
    const leaving = await listening("_probe-public");

    expect(await redisSubscribers("_probe-public")).toBe(1);

    leaving.close();

    await expect.poll(() => redisSubscribers("_probe-public")).toBe(0);

    const returning = await listening("_probe-public");

    expect(await redisSubscribers("_probe-public")).toBe(1);

    await guest().$fetch("/api/_broadcast-check", {
      method: "POST",
      body: { channel: "_probe-public", event: "pinged", payload: null },
    });
    expect(await returning.next()).toEqual({
      event: "message",
      data: JSON.stringify({ event: "pinged", payload: null }),
      id: expect.stringMatching(/^\d+-\d+$/),
    });
  });

  it("keeps delivering when a channel's last connection closes just as the next one opens", async () => {
    const leaving = await listening("_probe-public");

    leaving.close();

    const arriving = await listening("_probe-public");

    await guest().$fetch("/api/_broadcast-check", {
      method: "POST",
      body: { channel: "_probe-public", event: "pinged", payload: null },
    });
    expect(await arriving.next()).toEqual({
      event: "message",
      data: JSON.stringify({ event: "pinged", payload: null }),
      id: expect.stringMatching(/^\d+-\d+$/),
    });
    await expect.poll(() => redisSubscribers("_probe-public")).toBe(1);
  });

  it("sends a broadcast with params only to that room, and one without params only to the channel", async () => {
    const client = actingAs(await userFactory());
    const first = await client.listen("_probe-board?boardId=1");
    const second = await client.listen("_probe-board?boardId=2");
    const channel = await client.listen("_probe-board");

    await moveCard(1, 1);
    await moveCard(2, 2);
    await moveCard(3);
    await moveCard(4, 1, true);

    expect(await first.next()).toMatchObject({ event: "moved", payload: { card: 1 } });
    expect(await first.next()).toMatchObject({ event: "moved", payload: { card: 4 } });
    expect(await second.next()).toMatchObject({ event: "moved", payload: { card: 2 } });
    expect(await channel.next()).toMatchObject({ event: "moved", payload: { card: 3 } });
  });

  it("authorizes each room with its params", async () => {
    const stream = await actingAs(await userFactory()).listen(["_probe-board?boardId=1", "_probe-board?boardId=3"]);

    expect(stream.channels).toEqual(["_probe-board?boardId=1"]);
    expect(stream.refused).toEqual(["_probe-board?boardId=3"]);
  });

  it("replays the missed events of the room only", async () => {
    const client = actingAs(await userFactory());
    const first = await client.listen("_probe-board?boardId=1");

    await moveCard(1, 1);
    await moveCard(2, 2);
    await moveCard(3, 1);

    const seen = await first.next();

    first.close();

    const again = await client.listen("_probe-board?boardId=1", { lastEventId: seen.id });

    expect(await again.next()).toMatchObject({ event: "moved", payload: { card: 3 } });
  });
});
