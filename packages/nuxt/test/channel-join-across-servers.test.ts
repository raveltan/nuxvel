import superjson from "superjson";
import { expect, guest } from "@nuxvel/nuxt/testing";
import { afterAll, afterEach, beforeAll, describe, it } from "vitest";
import { closeChannelStreams, openStream } from "./helpers/channel-stream";
import { setupPlayground } from "./helpers/playground";
import { startSecondServer } from "./helpers/second-server";

async function connect() {
  const stream = await openStream(`/api/channels?channels=${encodeURIComponent("[]")}`);
  const first = await stream.next();

  expect(first).toMatchObject({ event: "connected" });

  const { connectionId }: { connectionId: string } = JSON.parse(
    first === "timeout" || first === "ended" ? "{}" : first.data,
  );

  return { stream, connectionId };
}

function post(serverUrl: string, path: string, body: Record<string, unknown>) {
  return fetch(new URL(path, serverUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function send(event: string, n: number) {
  return guest().$fetch("/api/_broadcast-check", {
    method: "POST",
    body: { channel: "_probe-public", event, payload: { n } },
  });
}

describe("channel join and leave across server processes", async () => {
  await setupPlayground();

  let second: Awaited<ReturnType<typeof startSecondServer>> | undefined;

  beforeAll(async () => {
    second = await startSecondServer();
  }, 40_000);

  afterEach(() => closeChannelStreams());

  afterAll(async () => {
    await second?.stop();
  });

  it("delivers on a stream held by one server after joining through another", async () => {
    if (!second) throw new Error("second server did not start");

    const { stream, connectionId } = await connect();

    expect(
      await post(second.url, "/api/channels/join", { connectionId, channel: "_probe-public" }),
    ).toMatchObject({ status: 200 });

    await send("joined", 1);

    expect(await stream.next()).toMatchObject({
      event: "channel:_probe-public",
      data: superjson.stringify({ event: "joined", payload: { n: 1 } }),
    });
    expect(await stream.next(300)).toBe("timeout");

    expect(
      await post(second.url, "/api/channels/leave", { connectionId, channel: "_probe-public" }),
    ).toMatchObject({ status: 200 });

    await send("left", 2);

    expect(await stream.next(300)).toBe("timeout");
  }, 15_000);

  it("answers 409 when no server holds the connection", async () => {
    if (!second) throw new Error("second server did not start");

    expect(
      await post(second.url, "/api/channels/join", {
        connectionId: "not-a-connection",
        channel: "_probe-public",
      }),
    ).toMatchObject({ status: 409 });
  });
});
