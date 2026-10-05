import { expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";
import { runProbeOnce } from "./helpers/probe";

describe("$fetch error mapping", async () => {
  await setupPlayground();
  const probe = runProbeOnce("/api/_fetch-error-check");

  it("surfaces a network failure, a 408 and a 5xx from an upstream as SERVICE_UNAVAILABLE", () => {
    expect(probe()).toMatchObject({
      network: { code: "SERVICE_UNAVAILABLE" },
      timeout: { code: "SERVICE_UNAVAILABLE" },
      unavailable: { code: "SERVICE_UNAVAILABLE" },
    });
  });

  it("surfaces an upstream 429 as TOO_MANY_REQUESTS with its Retry-After", () => {
    expect(probe().rateLimited).toEqual({ code: "TOO_MANY_REQUESTS", retryAfter: 7 });
  });

  it("leaves any other upstream 4xx unclassified", () => {
    expect(probe().notFound).toEqual({ code: "unclassified" });
  });
});
