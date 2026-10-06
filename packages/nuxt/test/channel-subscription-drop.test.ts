import superjson from "superjson";
import { expect, guest } from "@nuxvel/nuxt/testing";
import { Redis } from "ioredis";
import { afterEach, describe, it } from "vitest";
import {
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
    data: superjson.stringify({ event, payload: { n } }),
    id: expect.stringMatching(/^\d+-\d+$/),
  };
}

async function dropServerSubscriptions() {
  const redis = new Redis(process.env.NUXT_REDIS_URL ?? "");

  try {
    const clients = await redis.call("CLIENT", "LIST", "TYPE", "pubsub");
    const ids = String(clients)
      .split("\n")
      .filter((line) => line.includes(` db=${redis.options.db ?? 0} `))
      .map((line) => /^id=(\d+) /.exec(line)?.[1])
      .filter((id) => id !== undefined);

    for (const id of ids) await redis.call("CLIENT", "KILL", "ID", id);

    return ids.length;
  } finally {
    await redis.quit();
  }
}

describe("channel streams when the Redis subscription drops", async () => {
  await setupPlayground();

  afterEach(() => closeChannelStreams());

  it("ends open streams, so the client reconnects and replays what it missed", async () => {
    const first = await listening();

    await send("seen", 1);

    const seen = await first.next();

    expect(await dropServerSubscriptions()).toBe(1);

    await send("missed", 2);

    expect(await first.next()).toBe("ended");
    expect(first.ended()).toBe(true);

    const again = await listening({ "last-event-id": seen?.id ?? "" });

    expect(await again.next()).toEqual(received("missed", 2));
  });

  it("reports a new stream connected only once its subscription is back", async () => {
    const first = await listening();

    expect(await dropServerSubscriptions()).toBe(1);
    // the server may take the next request before it sees its subscriber's socket close, and would end that stream too
    expect(await first.next()).toBe("ended");

    const next = await listening();

    await send("after", 1);

    expect(await next.next()).toEqual(received("after", 1));
  });
});
