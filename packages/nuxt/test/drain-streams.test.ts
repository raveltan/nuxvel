import { expect } from "@nuxvel/nuxt/testing";
import { describe, it, onTestFinished } from "vitest";
import { closeChannelStreams, openChannelStream } from "./helpers/channel-stream";
import { startSecondServer } from "./helpers/second-server";

describe("draining realtime streams", () => {
  it("closes the open streams on SIGUSR2 under pm2 and keeps serving, so clients reconnect elsewhere", async () => {
    const server = await startSecondServer({ env: { pm_id: "0", NUXVEL_REALTIME_DRAIN_SECONDS: "1" } });
    onTestFinished(async () => {
      closeChannelStreams();
      await server.stop();
    });
    const stream = await openChannelStream("_probe-public", {}, server.url);
    expect(await stream.next()).toEqual({ event: "connected", data: "{}" });

    server.child.kill("SIGUSR2");

    expect(await stream.next(5000)).toBe("ended");
    expect((await fetch(new URL("/api/health/live", server.url))).status).toBe(200);
  }, 60_000);
});
