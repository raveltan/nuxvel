import { randomUUID } from "node:crypto";
import { Redis } from "ioredis";
import { afterEach, describe, it } from "vitest";

import { expect, runJob } from "@nuxvel/nuxt/testing";
import {
  closeChannelStreams,
  openChannelStream,
  openStream,
} from "./helpers/channel-stream";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { postJson, sessionCookie } from "./helpers/auth-flows";
import { setupPlayground } from "./helpers/playground";

const PASSWORD = "correct-horse-battery-staple";

function jobEvent(job: string, event: string, payload: unknown) {
  return {
    event: `channel:job:${job}`,
    data: JSON.stringify({ event, payload }),
    id: expect.stringMatching(/^\d+-\d+$/),
  };
}

function progress(percent: number) {
  return jobEvent("_probe.progress", "progress", { percent });
}

function jobStream(job: string) {
  return openStream(
    `/api/channels?channels=${encodeURIComponent(JSON.stringify([{ name: `job:${job}` }]))}`,
  );
}

describe("job progress", async () => {
  await setupPlayground();

  afterEach(() => closeChannelStreams());

  it("broadcasts what the handler reports, then completed, on the job's channel", async () => {
    const stream = await openStream(
      `/api/channels?channels=${encodeURIComponent(
        JSON.stringify([{ name: "job:_probe.progress" }]),
      )}`,
    );

    expect(await stream.next()).toMatchObject({ event: "connected" });

    await runJob("_probe.progress", {});

    expect(await stream.next()).toEqual(progress(50));
    expect(await stream.next()).toEqual(progress(100));
    expect(await stream.next()).toEqual(
      jobEvent("_probe.progress", "completed", { result: null }),
    );
  }, 30_000);

  it("broadcasts failed with a generic message, never the error's own, once the last attempt throws", async () => {
    const stream = await jobStream("_probe.always-fails");

    expect(await stream.next()).toMatchObject({ event: "connected" });

    await expect(runJob("_probe.always-fails", {})).rejects.toThrow(
      "probe.always-fails always fails",
    );

    expect(await stream.next()).toEqual(
      jobEvent("_probe.always-fails", "failed", { message: "Something went wrong" }),
    );
  }, 30_000);

  it("broadcasts a user's run on that user's channel only, and refuses every other listener", async () => {
    const ada = await userFactory.withPassword(PASSWORD)({ email: "job-progress-ada@example.com" });
    const bob = await userFactory.withPassword(PASSWORD)({ email: "job-progress-bob@example.com" });
    const adaCookie = sessionCookie(await postJson("/api/auth/sign-in/email", { email: ada.email, password: PASSWORD })) ?? "";
    const bobCookie = sessionCookie(await postJson("/api/auth/sign-in/email", { email: bob.email, password: PASSWORD })) ?? "";
    const channel = `job:_probe.progress:${ada.id}`;
    const own = await openChannelStream(channel, { cookie: adaCookie });
    const shared = await jobStream("_probe.progress");

    expect((await openChannelStream(channel, { cookie: bobCookie })).response.status).toBe(403);
    expect((await openChannelStream(channel)).response.status).toBe(403);
    expect(await own.next()).toEqual({ event: "connected", data: "{}" });
    expect(await shared.next()).toMatchObject({ event: "connected" });

    await runJob("_probe.progress", {}, { actingAs: ada });

    expect(await own.next()).toMatchObject({ data: JSON.stringify({ event: "progress", payload: { percent: 50 } }) });
    expect(await own.next()).toMatchObject({ data: JSON.stringify({ event: "progress", payload: { percent: 100 } }) });
    expect(await own.next()).toMatchObject({ data: JSON.stringify({ event: "completed", payload: { result: null } }) });
    expect(await shared.next(500)).toBe("timeout");
  }, 30_000);

  it("broadcasts failed with the validation message for an invalid payload", async () => {
    const stream = await jobStream("_probe.always-fails");

    expect(await stream.next()).toMatchObject({ event: "connected" });

    // @ts-expect-error the payload is invalid on purpose
    await expect(runJob("_probe.always-fails", "not an object")).rejects.toBeTrpcError(
      "BAD_REQUEST",
    );

    expect(await stream.next()).toEqual(
      jobEvent("_probe.always-fails", "failed", { message: "Invalid input" }),
    );
  }, 30_000);

  it("broadcasts nothing for a job without a channel, and never fails a run whose broadcast fails", async () => {
    const redis = new Redis(process.env.NUXT_REDIS_URL ?? "");
    const recordReplay = "nuxvel:channel:job:_probe.record:replay";

    try {
      await redis.del(recordReplay);

      await runJob("_probe.record", { name: `no-channel-${randomUUID()}` });
      await runJob("_probe.unserializable-result", {});

      expect(await redis.exists(recordReplay)).toBe(0);
    } finally {
      await redis.quit();
    }
  });

  it("serves a job's channel only for a job with one, authorized by its authorize", async () => {
    expect((await openChannelStream("job:demo.countdown")).response.status).toBe(403);
    expect((await openChannelStream("job:_probe.record")).response.status).toBe(404);
  });
});
