import { expect, guest } from "@nuxvel/nuxt/testing";
import { Redis } from "ioredis";
import { afterEach, describe, it } from "vitest";
import {
  type StreamMessage,
  closeChannelStreams,
  openChannelStream,
} from "./helpers/channel-stream";
import { setupPlayground } from "./helpers/playground";

async function listening(headers: Record<string, string> = {}) {
  const stream = await openChannelStream("_probe-public", headers);

  expect(await stream.next()).toEqual({ event: "connected", data: "{}" });

  return stream;
}

async function send(event: string, n: number) {
  await guest().$fetch("/api/_broadcast-check", {
    method: "POST",
    body: { channel: "_probe-public", event, payload: { n } },
  });
}

function received(event: string, n: number) {
  return {
    event: "message",
    data: JSON.stringify({ event, payload: { n } }),
    id: expect.stringMatching(/^\d+-\d+$/),
  };
}

function compareEventIds(a: string, b: string) {
  const [aTime = 0n, aSequence = 0n] = a.split("-").map(BigInt);
  const [bTime = 0n, bSequence = 0n] = b.split("-").map(BigInt);

  if (aTime !== bTime) return aTime < bTime ? -1 : 1;
  if (aSequence !== bSequence) return aSequence < bSequence ? -1 : 1;

  return 0;
}

describe("channel replay buffer", async () => {
  await setupPlayground();

  afterEach(() => closeChannelStreams());

  it("catches a reconnecting client up on what it missed, in order, once", async () => {
    const first = await listening();

    await send("seen", 1);

    const seen = await first.next();

    expect(seen).toEqual(received("seen", 1));

    first.close();

    await send("missed", 2);
    await send("missed", 3);

    const again = await listening({ "last-event-id": seen?.id ?? "" });

    expect(await again.next()).toEqual(received("missed", 2));
    expect(await again.next()).toEqual(received("missed", 3));

    await send("live", 4);

    expect(await again.next()).toEqual(received("live", 4));
    expect(await again.next(300)).toBe("timeout");
  });

  it("holds back live events that race the backlog, so none repeats or arrives out of order", async () => {
    const first = await listening();

    await send("seen", 0);

    const seen = await first.next();

    first.close();

    for (let n = 1; n <= 20; n += 1) await send("missed", n);

    let sent = 20;
    let reconnected = false;

    async function keepSending() {
      while (!reconnected) {
        sent += 1;
        await send("racing", sent);
      }
    }

    const senders = Array.from({ length: 8 }, () => keepSending());
    const again = await listening({ "last-event-id": seen?.id ?? "" });

    reconnected = true;
    await Promise.all(senders);

    const delivered: StreamMessage[] = [];

    for (let message = await again.next(); typeof message !== "string"; message = await again.next(500)) {
      delivered.push(message);
    }

    const ids = delivered.map((message) => message.id ?? "");
    const numbers = delivered.map(
      (message) => (JSON.parse(message.data) as { payload: { n: number } }).payload.n,
    );

    expect(ids).toEqual([...ids].sort(compareEventIds));
    expect(new Set(ids).size).toBe(ids.length);
    expect([...numbers].sort((a, b) => a - b)).toEqual(
      Array.from({ length: sent }, (_, index) => index + 1),
    );
  });

  it("sends resync before the backlog to a client that missed more than the buffer holds", async () => {
    const first = await listening();

    await send("seen", 0);

    const seen = await first.next();

    first.close();

    for (let batch = 0; batch < 600; batch += 50) {
      await Promise.all(Array.from({ length: 50 }, (_, n) => send("missed", batch + n + 1)));
    }

    const again = await listening({ "last-event-id": seen?.id ?? "" });

    expect(await again.next()).toEqual({ event: "resync", data: JSON.stringify({ channel: "_probe-public" }) });

    const backlog: StreamMessage[] = [];

    for (let message = await again.next(); typeof message !== "string"; message = await again.next(300)) {
      backlog.push(message);
    }

    expect(backlog).toHaveLength(500);
  });

  it("replays nothing to a client without a usable last event ID", async () => {
    await send("before", 1);

    const fresh = await listening();
    const garbled = await listening({ "last-event-id": "not-an-id" });
    const outOfRange = await listening({ "last-event-id": "18446744073709551616-0" });
    const last = await listening({
      "last-event-id": "18446744073709551615-18446744073709551615",
    });

    expect(await fresh.next(300)).toBe("timeout");
    expect(await garbled.next(300)).toBe("timeout");
    expect(await outOfRange.next(300)).toBe("timeout");
    expect(await last.next(300)).toBe("timeout");
  });

  const DAY = 24 * 60 * 60 * 1000;
  const resync = { event: "resync", data: JSON.stringify({ channel: "_probe-public" }) };

  async function withRedis<T>(use: (redis: Redis) => Promise<T>) {
    const redis = new Redis(process.env.NUXT_REDIS_URL ?? "");

    try {
      return await use(redis);
    } finally {
      await redis.quit();
    }
  }

  function dropReplayBuffer() {
    return withRedis((redis) => redis.del("nuxvel:channel:_probe-public:replay"));
  }

  async function redisNow() {
    const [seconds = 0, microseconds = 0] = (await withRedis((redis) => redis.time())).map(Number);

    return seconds * 1000 + Math.floor(microseconds / 1000);
  }

  it("sends no resync to a client with a recent cursor when the channel has no replay buffer", async () => {
    await dropReplayBuffer();

    const recent = await listening({ "last-event-id": `${await redisNow()}-0` });

    expect(await recent.next(300)).toBe("timeout");
  });

  it("sends resync to a client with a cursor older than the replay expiry when the buffer is gone", async () => {
    await dropReplayBuffer();

    const stale = await listening({ "last-event-id": `${(await redisNow()) - DAY - 60_000}-0` });
    const unseen = await listening({ "last-event-id": "0-0" });

    expect(await stale.next()).toEqual(resync);
    expect(await unseen.next(300)).toBe("timeout");
  });

  it("sends resync, then the new events, to a client with an old cursor when the buffer started again", async () => {
    await dropReplayBuffer();
    await send("recreated", 3);

    const stale = await listening({ "last-event-id": `${(await redisNow()) - DAY - 60_000}-0` });

    expect(await stale.next()).toEqual(resync);
    expect(await stale.next()).toEqual(received("recreated", 3));
  });

  it("replays the events of a buffer that started after a recent cursor, without resync", async () => {
    await dropReplayBuffer();

    const cursor = `${(await redisNow()) - 1000}-0`;

    await send("later", 4);

    const recent = await listening({ "last-event-id": cursor });

    expect(await recent.next()).toEqual(received("later", 4));
    expect(await recent.next(300)).toBe("timeout");
  });
});
