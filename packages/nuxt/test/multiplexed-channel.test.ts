import { expect, guest } from "@nuxvel/nuxt/testing";
import { afterEach, describe, it, vi } from "vitest";
import { closeChannelStreams, openStream } from "./helpers/channel-stream";
import { setupPlayground } from "./helpers/playground";

interface Connected {
  connectionId: string;
  channels: string[];
  refused: string[];
}

async function connect(channels: string[]) {
  const stream = await openStream(
    `/api/channels?channels=${encodeURIComponent(
      JSON.stringify(channels.map((name) => ({ name }))),
    )}`,
  );
  const first = await stream.next();

  expect(first?.event).toBe("connected");

  const connected: Connected = JSON.parse(first?.data ?? "{}");

  return { stream, connected };
}

function join(body: Record<string, unknown>) {
  return guest().fetch("/api/channels/join", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function leave(body: Record<string, unknown>) {
  return guest().fetch("/api/channels/leave", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function send(channel: string, event: string, n: number) {
  return guest().$fetch("/api/_broadcast-check", {
    method: "POST",
    body: { channel, event, payload: { n } },
  });
}

describe("multiplexed channel connection", async () => {
  await setupPlayground();

  afterEach(() => closeChannelStreams());

  it("opens one stream for every channel the connection may listen to", async () => {
    const { stream, connected } = await connect(["_probe-public", "_probe-members"]);

    expect(connected.channels).toEqual(["_probe-public"]);
    expect(connected.refused).toEqual(["_probe-members"]);
    expect(connected.connectionId).toEqual(expect.any(String));

    await send("_probe-public", "pinged", 1);

    expect(await stream.next()).toEqual({
      event: "channel:_probe-public",
      data: JSON.stringify({ event: "pinged", payload: { n: 1 } }),
      id: expect.stringMatching(/^\d+-\d+$/),
    });
  });

  it("joins and leaves channels over the open connection", async () => {
    const { stream, connected } = await connect([]);

    expect(await join({ connectionId: connected.connectionId, channel: "_probe-public" }))
      .toMatchObject({ status: 200 });

    await send("_probe-public", "joined", 1);

    expect(await stream.next()).toMatchObject({
      event: "channel:_probe-public",
      data: JSON.stringify({ event: "joined", payload: { n: 1 } }),
    });

    await leave({ connectionId: connected.connectionId, channel: "_probe-public" });
    await send("_probe-public", "left", 2);

    expect(await stream.next(300)).toBe("timeout");
  });

  it("carries an awkward channel name through the query unchanged", async () => {
    const names = ["a:b", "a,b", "a b", "a%2Fb", 'a"b', "a/b", "ünïcode", ""];
    const { connected } = await connect(names);

    expect(connected.channels).toEqual([]);
    expect(connected.refused).toEqual(names);
  });

  it("forgets a connection once its stream closes", async () => {
    const { stream, connected } = await connect(["_probe-public"]);

    stream.close();

    await vi.waitFor(async () =>
      expect(
        await join({
          connectionId: connected.connectionId,
          channel: "_probe-public",
        }),
      ).toMatchObject({ status: 409 }),
    );
  });

  it("refuses a join or leave it cannot serve with the route-error shape", async () => {
    const { connected } = await connect([]);
    const refusals = [
      [await join({ connectionId: connected.connectionId }), 400, "VALIDATION_ERROR"],
      [await leave({ channel: "_probe-public" }), 400, "VALIDATION_ERROR"],
      [await join({ connectionId: connected.connectionId, channel: "nope" }), 404, "NOT_FOUND"],
      [await join({ connectionId: connected.connectionId, channel: "_probe-members" }), 403, "FORBIDDEN"],
      [await join({ connectionId: "not-a-connection", channel: "_probe-public" }), 409, "CONFLICT"],
      [await leave({ connectionId: "not-a-connection", channel: "_probe-public" }), 409, "CONFLICT"],
    ] as const;

    for (const [response, status, code] of refusals) {
      expect(response.status).toBe(status);
      expect(await response.json()).toMatchObject({
        statusCode: status,
        message: expect.any(String),
        data: { code, message: expect.any(String) },
      });
    }
  });
});
