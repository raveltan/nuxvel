import { actingAs, expect, guest, type TestClient } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { url } from "@nuxt/test-utils/e2e";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

async function expose(name: string, send: TestClient["fetch"] = guest().fetch) {
  const response = await send("/api/flags/exposures", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: new URL(url("/")).origin,
    },
    body: JSON.stringify({ name }),
  });

  expect(response.status).toBe(200);
}

type Exposure = { name: string; unitId: string; variant: string };

async function runExperiment(running: boolean) {
  await guest().$fetch("/api/_experiment-check", { method: "POST", body: { running } });
}

describe("flag exposures", async () => {
  await setupPlayground();

  it("records one exposure when the same user renders an experiment twice", async () => {
    const user = await userFactory({ email: "exposure@example.com" });
    const client = actingAs(user);

    await runExperiment(true);

    await client.$fetch("/api/flags");
    await expose("probe-cta", client.fetch);
    await client.$fetch("/api/flags");
    await expose("probe-cta", client.fetch);

    const exposures = await guest().$fetch<Exposure[]>("/api/_flag-exposures-check");

    expect(exposures).toEqual([
      {
        name: "probe-cta",
        unitId: user.id,
        variant: expect.stringMatching(/^(control|green)$/),
      },
    ]);
  });

  it("records nothing for a guest", async () => {
    await expose("probe-cta");
    await expose("probe-rollout");

    expect(await guest().$fetch<Exposure[]>("/api/_flag-exposures-check")).toEqual([]);
  });

  it("dedupes exposures from server-side evaluation too", async () => {
    await runExperiment(true);

    const exposures = await guest().$fetch<Exposure[]>("/api/_flag-exposures-check", {
      query: { subject: "server-user" },
    });

    expect(exposures).toEqual([
      {
        name: "probe-cta",
        unitId: "server-user",
        variant: expect.stringMatching(/^(control|green)$/),
      },
      { name: "probe-rollout", unitId: "server-user", variant: "false" },
    ]);
  });

  it("serves a stopped experiment's control and records no exposure for it", async () => {
    const client = actingAs(await userFactory({ email: "stopped@example.com" }));

    await runExperiment(true);
    await runExperiment(false);

    const values = await client.$fetch<{ experiments: Record<string, string> }>("/api/flags");

    expect(values.experiments["probe-cta"]).toBe("control");

    await expose("probe-cta", client.fetch);

    const exposures = await guest().$fetch<Exposure[]>("/api/_flag-exposures-check", {
      query: { subject: "stopped-user" },
    });

    expect(exposures).toEqual([
      { name: "probe-rollout", unitId: "stopped-user", variant: "false" },
    ]);
  });

  it("rejects an exposure for an unknown flag", async () => {
    const response = await guest().fetch("/api/flags/exposures", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: new URL(url("/")).origin,
      },
      body: JSON.stringify({ name: "nope" }),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      data: { code: "NOT_FOUND", message: 'No flag is named "nope"' },
    });
  });
});
