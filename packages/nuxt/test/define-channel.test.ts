import { expect } from "@nuxvel/nuxt/testing";
import { afterEach, describe, it } from "vitest";
import {
  closeChannelStreams,
  openChannelStream,
} from "./helpers/channel-stream";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { postJson, sessionCookie } from "./helpers/auth-flows";
import { setupPlayground } from "./helpers/playground";

const PASSWORD = "correct-horse-battery-staple";

describe("defineChannel()", async () => {
  await setupPlayground();

  afterEach(() => closeChannelStreams());

  it("rejects a guest before the stream opens when the channel leaves out authorize", async () => {
    const stream = await openChannelStream("_probe-members");

    expect(stream.response.status).toBe(403);
    expect(await stream.response.json()).toMatchObject({
      statusCode: 403,
      data: { code: "FORBIDDEN", message: 'Not allowed to listen to channel "_probe-members"' },
    });
  });

  it("opens the connection of a signed-in user when the channel leaves out authorize, and keeps it open", async () => {
    const member = await userFactory.withPassword(PASSWORD)({ email: "channel-member@example.com" });
    const cookie = sessionCookie(await postJson("/api/auth/sign-in/email", { email: member.email, password: PASSWORD })) ?? "";
    const stream = await openChannelStream("_probe-members", { cookie });

    expect(stream.response.status).toBe(200);
    expect(stream.response.headers.get("content-type")).toBe(
      "text/event-stream",
    );
    expect(stream.response.headers.get("cache-control")).toContain("no-cache");
    expect(stream.response.headers.get("x-accel-buffering")).toBe("no");
    expect(await stream.next()).toEqual({ event: "connected", data: "{}" });
    expect(await stream.next(300)).toBe("timeout");
  });

  it("opens the connection of a guest on a public channel, and refuses one that authorize refuses", async () => {
    expect((await openChannelStream("_probe-public")).response.status).toBe(200);
    expect((await openChannelStream("_probe-admins")).response.status).toBe(403);
  });

  it("answers 404 for a channel nothing defines", async () => {
    const stream = await openChannelStream("missing");

    expect(stream.response.status).toBe(404);
    expect(await stream.response.json()).toMatchObject({
      data: { code: "NOT_FOUND", message: 'No channel is named "missing"' },
    });
  });
});
