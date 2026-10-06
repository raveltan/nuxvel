import superjson from "superjson";
import postgres from "postgres";
import { actingAs, expect, guest, type TestClient } from "@nuxvel/nuxt/testing";
import { afterEach, describe, it } from "vitest";
import {
  closeChannelStreams,
  openChannelStream,
} from "./helpers/channel-stream";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

async function target(targeting: object) {
  await guest().$fetch("/api/_flag-targeting-check", {
    method: "POST",
    body: targeting,
  });
}

async function renderedFlags(send: TestClient["$fetch"] = guest().$fetch) {
  const html = await send<string>("/_flags");

  return html.match(/probe-rollout:\w+ probe-cta:\w*/)?.[0];
}

describe("useFlag() / useExperiment() SSR", async () => {
  await setupPlayground();

  afterEach(() => closeChannelStreams());

  it("saves no targeting when its audit row cannot be written", async () => {
    const owner = postgres(process.env.NUXT_DATABASE_URL ?? "", { max: 1, onnotice: () => {} });

    await owner.unsafe("alter table audit_log rename to audit_log_gone");

    try {
      await expect(target({ percentage: 100 })).rejects.toThrow();
    } finally {
      await owner.unsafe("alter table audit_log_gone rename to audit_log");
      await owner.end();
    }

    expect(await renderedFlags()).toBe("probe-rollout:false probe-cta:control");
  });

  it("server-renders each flag's value for the requesting user", async () => {
    expect(await renderedFlags()).toBe("probe-rollout:false probe-cta:control");

    await target({ percentage: 100 });

    expect(await renderedFlags()).toBe("probe-rollout:true probe-cta:control");
  });

  it("still renders the page when loading the flag values fails", async () => {
    const response = await guest().fetch("/_flags", {
      headers: { "x-probe-flags-fail": "1" },
    });

    expect(response.status).toBe(200);
  });

  it("says which user the values were evaluated for", async () => {
    const user = await userFactory({ email: "flag-subject@example.com" });

    expect(await guest().$fetch("/api/flags")).toMatchObject({ subject: null });
    expect(await actingAs(user).$fetch("/api/flags")).toMatchObject({
      subject: expect.any(String),
    });
  });

  it("evaluates a role rule against the signed-in user's role", async () => {
    const user = await userFactory({ email: "flag-role@example.com" });

    await target({ roles: { user: true } });

    expect(await renderedFlags()).toBe("probe-rollout:false probe-cta:control");
    expect(await renderedFlags(actingAs(user).$fetch)).toMatch(/^probe-rollout:true /);
  });

  it("announces a targeting change on the flags channel", async () => {
    const stream = await openChannelStream("flags");

    expect(await stream.next()).toMatchObject({ event: "connected" });

    await target({ percentage: 50 });

    const message = await stream.next();

    expect(superjson.parse(message?.data ?? "null")).toEqual({
      event: "changed",
      payload: { name: "probe-rollout" },
    });
  });
});
