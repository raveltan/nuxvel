import { expect } from "@nuxvel/nuxt/testing";
import { afterEach, describe, it } from "vitest";
import { closeChannelStreams, openStream } from "./helpers/channel-stream";
import { setupPlayground } from "./helpers/playground";

describe("defineStreamHandler()", async () => {
  await setupPlayground();

  afterEach(() => closeChannelStreams());

  it("streams what the handler pushes, then ends", async () => {
    const stream = await openStream("/api/_stream-check");

    expect(stream.response.headers.get("content-type")).toContain("text/event-stream");
    expect(await stream.next()).toEqual({ event: "token", data: "one" });
    expect(await stream.next()).toEqual({ event: "token", data: "two" });
    expect(await stream.next()).toEqual({ event: "token", data: "three" });
    expect(await stream.next()).toBe("ended");
  });

  it("answers 403 when authorize refuses", async () => {
    const stream = await openStream("/api/_stream-members-check");

    expect(stream.response.status).toBe(403);
    expect(await stream.response.json()).toMatchObject({ data: { code: "FORBIDDEN" } });
  });
});
