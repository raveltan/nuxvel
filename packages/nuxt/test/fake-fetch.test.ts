import { describe, it } from "vitest";
import { expect, expectFetched, expectRow, fakeFetch, runJob } from "@nuxvel/nuxt/testing";
import { healthChecksTable } from "../../../playground/server/database/schema/health-check.schema";
import { setupPlayground } from "./helpers/playground";

describe("fakeFetch() / expectFetched()", async () => {
  await setupPlayground();

  it("answers a job's $fetch with the scripted response and records the request", async () => {
    await fakeFetch({ "https://status.example.com/*": { body: { status: "green" } } });

    await runJob("_probe.post-to-url", { url: "https://status.example.com/ping", name: "faked" });

    await expectRow(healthChecksTable, { name: "faked:green" });
    await expectFetched("https://status.example.com/ping", { method: "POST", times: 1 });
    await expect(expectFetched("https://status.example.com/ping", { times: 2 })).rejects.toThrow(
      "expectFetched: expected a request to https://status.example.com/ping 2 times, found 1",
    );
  });

  it("fails a request that no fake response matches like a network failure", async () => {
    await fakeFetch({ "https://status.example.com/ping": { body: { status: "green" } } });

    await expect(
      runJob("_probe.post-to-url", { url: "https://unfaked.example.com/ping", name: "unfaked" }),
    ).rejects.toThrow("An upstream service did not answer");
    await expectFetched("https://unfaked.example.com/*");
  });

  it("records nothing once the test that faked fetch has ended", async () => {
    await expect(expectFetched("https://status.example.com/*")).rejects.toThrow("expectFetched: expected a request to");
  });
});
