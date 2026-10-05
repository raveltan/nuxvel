import { expect, guest } from "@nuxvel/nuxt/testing";
import { afterAll, afterEach, beforeAll, describe, it } from "vitest";
import {
  closeChannelStreams,
  openChannelStream,
} from "./helpers/channel-stream";
import { startSecondServer } from "./helpers/second-server";
import { setupPlayground } from "./helpers/playground";

async function listening(name: string, serverUrl?: string) {
  const stream = await openChannelStream(name, {}, serverUrl);

  expect(await stream.next()).toEqual({ event: "connected", data: "{}" });

  return stream;
}

describe("broadcast() across processes", async () => {
  await setupPlayground();

  let second: Awaited<ReturnType<typeof startSecondServer>> | undefined;

  beforeAll(async () => {
    second = await startSecondServer();
  }, 40_000);

  afterEach(() => closeChannelStreams());

  afterAll(async () => {
    await second?.stop();
  });

  it("reaches connections held by every server process, once each", async () => {
    if (!second) throw new Error("second server did not start");

    const onFirst = await listening("_probe-public");
    const onSecond = await listening("_probe-public", second.url);

    await guest().$fetch("/api/_broadcast-check", {
      method: "POST",
      body: { channel: "_probe-public", event: "fanned", payload: { n: 1 } },
    });

    const expected = {
      event: "message",
      data: JSON.stringify({ event: "fanned", payload: { n: 1 } }),
      id: expect.stringMatching(/^\d+-\d+$/),
    };

    expect(await onFirst.next()).toEqual(expected);
    expect(await onSecond.next()).toEqual(expected);
    expect(await onFirst.next(300)).toBe("timeout");
    expect(await onSecond.next(300)).toBe("timeout");
  }, 15_000);
});
