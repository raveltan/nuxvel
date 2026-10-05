import { actingAs, expect, guest } from "@nuxvel/nuxt/testing";
import { afterAll, afterEach, beforeAll, describe, it, vi } from "vitest";
import { Redis } from "ioredis";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { closeChannelStreams, openChannelStream, openStream } from "./helpers/channel-stream";
import { setupPlayground } from "./helpers/playground";
import { sessionCookie } from "./helpers/session-cookie";
import { startSecondServer } from "./helpers/second-server";

function join() {
  return guest().fetch("/api/channels/join", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ connectionId: "gone", channel: "_probe-public" }),
  });
}

function openChannels(names: string[]) {
  return openStream(`/api/channels?channels=${encodeURIComponent(JSON.stringify(names.map((name) => ({ name }))))}`);
}

describe("realtime connection and join limits", async () => {
  await setupPlayground();

  let capped: Awaited<ReturnType<typeof startSecondServer>> | undefined;

  beforeAll(async () => {
    capped = await startSecondServer({ env: { NUXT_NUXVEL_REALTIME_MAX_CONNECTIONS: "2" } });
  }, 40_000);

  afterEach(() => closeChannelStreams());

  afterAll(async () => {
    await capped?.stop();
  });

  it("refuses a connection over the cap with 429 and Retry-After, and frees the slot on close", async () => {
    const serverUrl = capped?.url ?? "";
    const first = await openChannelStream("_probe-public", {}, serverUrl);
    const second = await openChannelStream("_probe-public", {}, serverUrl);

    expect(await first.next()).toMatchObject({ event: "connected" });
    expect(await second.next()).toMatchObject({ event: "connected" });

    const over = await openChannelStream("_probe-public", {}, serverUrl);

    expect(over.response.status).toBe(429);
    expect(over.response.headers.get("retry-after")).toBe("10");
    expect(await over.response.json()).toMatchObject({ data: { code: "TOO_MANY_REQUESTS" } });

    first.close();

    await vi.waitFor(async () => {
      const again = await openChannelStream("_probe-public", {}, serverUrl);

      expect(again.response.status).toBe(200);
    });
  });

  it("rate limits channel joins with the built-in channel-join limit", async () => {
    const statuses = await Promise.all(Array.from({ length: 60 }, async () => (await join()).status));

    expect(new Set(statuses)).toEqual(new Set([409]));

    const over = await join();

    expect(over.status).toBe(429);
    expect(Number(over.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("expires a channel's replay stream 24 hours after its last broadcast", async () => {
    const channel = `_replay-ttl-${crypto.randomUUID()}`;

    await guest().$fetch("/api/_broadcast-check", { method: "POST", body: { channel, event: "sent", payload: {} } });

    const redis = new Redis(process.env.NUXT_REDIS_URL ?? "");

    try {
      const ttl = await redis.pttl(`nuxvel:channel:${channel}:replay`);

      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(86_400_000);
    } finally {
      await redis.quit();
    }
  });

  it("refuses a channel name over 256 characters", async () => {
    const client = actingAs(await userFactory());
    const cookie = await sessionCookie(client);
    const long = `posts?id=1&pad=${"x".repeat(300)}`;
    const post = (path: string, body: object) =>
      client.fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ connectionId: "gone", channel: long, ...body }),
      });

    for (const [path, body] of [
      ["/api/channels/join", {}],
      ["/api/channels/leave", {}],
      ["/api/channels/presence", { state: {} }],
    ] as const) {
      const response = await post(path, body);

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ data: { code: "VALIDATION_ERROR" } });
    }

    const stream = await openStream(
      `/api/channels?channels=${encodeURIComponent(JSON.stringify([{ name: long }, { name: "_probe-public" }]))}`,
      { cookie },
    );
    const first = await stream.next();

    if (first === "timeout" || first === "ended") throw new Error(`no connected event: ${first}`);

    expect(JSON.parse(first.data)).toMatchObject({ channels: ["_probe-public"], refused: [] });
  });

  it("keeps a presence room's replay stream only as long as its presence", async () => {
    const cookie = await sessionCookie(actingAs(await userFactory()));
    const room = `posts?id=${crypto.randomUUID()}`;
    const stream = await openStream(`/api/channels?channels=${encodeURIComponent(JSON.stringify([{ name: room }]))}`, {
      cookie,
    });

    expect(await stream.next()).toMatchObject({ event: "connected" });

    const redis = new Redis(process.env.NUXT_REDIS_URL ?? "");

    try {
      await vi.waitFor(async () => {
        const ttl = await redis.pttl(`nuxvel:channel:${room}:replay`);

        expect(ttl).toBeGreaterThan(0);
        expect(ttl).toBeLessThanOrEqual(30_000);
      });
    } finally {
      await redis.quit();
    }
  });

  it("opens at most 20 channels on one connection and refuses the rest", async () => {
    const stream = await openChannels(Array.from({ length: 50 }, () => "_probe-public"));
    const first = await stream.next();

    if (first === "timeout" || first === "ended") throw new Error(`no connected event: ${first}`);

    const connected: { channels: string[]; refused: string[] } = JSON.parse(first.data);

    expect(connected.channels).toHaveLength(20);
    expect(connected.refused).toHaveLength(30);
  });

  it("refuses a join over 20 channels on one connection with a refused event, and counts only the channels it holds now", async () => {
    const client = actingAs(await userFactory());
    const cookie = await sessionCookie(client);
    const base = crypto.randomUUID();
    const room = (index: number) => `posts?id=${base}-${index}`;
    const names = Array.from({ length: 20 }, (_, index) => ({ name: room(index) }));
    const stream = await openStream(`/api/channels?channels=${encodeURIComponent(JSON.stringify(names))}`, { cookie });
    const first = await stream.next();

    if (first === "timeout" || first === "ended") throw new Error(`no connected event: ${first}`);

    const connected: { channels: string[]; connectionId: string } = JSON.parse(first.data);

    expect(connected.channels).toHaveLength(20);

    function command(path: string, channel: string) {
      return client.fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ connectionId: connected.connectionId, channel }),
      });
    }

    async function until(events: string[]) {
      for (;;) {
        const message = await stream.next();

        if (message === "timeout" || message === "ended") throw new Error(`no answer: ${message}`);
        if (events.includes(message.event)) return message;
      }
    }

    const answers = ["refused", `channel:${room(20)}`];

    expect((await command("/api/channels/join", room(20))).status).toBe(200);

    const refused = await until(answers);

    expect(refused).toMatchObject({ event: "refused" });
    expect(JSON.parse(refused.data)).toEqual({ channel: room(20) });

    expect((await command("/api/channels/leave", room(0))).status).toBe(200);
    expect((await command("/api/channels/join", room(20))).status).toBe(200);
    expect(await until(answers)).toMatchObject({ event: `channel:${room(20)}` });
  });

  it("counts each channel of a multiplexed open against the channel-join limit", async () => {
    const twenty = Array.from({ length: 20 }, () => "_probe-public");

    for (let open = 0; open < 3; open += 1) {
      const stream = await openChannels(twenty);

      expect(stream.response.status).toBe(200);
    }

    const over = await openChannels(twenty);

    expect(over.response.status).toBe(429);
    expect(Number(over.response.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("rate limits presence state updates per user", async () => {
    const client = actingAs(await userFactory());

    function update() {
      return client.fetch("/api/channels/presence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ connectionId: "gone", channel: "posts?id=1", state: {} }),
      });
    }

    const statuses = await Promise.all(Array.from({ length: 120 }, async () => (await update()).status));

    expect(new Set(statuses)).toEqual(new Set([403]));

    const over = await update();

    expect(over.status).toBe(429);
    expect(Number(over.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});
