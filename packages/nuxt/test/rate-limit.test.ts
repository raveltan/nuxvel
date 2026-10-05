import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";

function rateLimitHeaders(response: Response) {
  return ["ratelimit-limit", "ratelimit-remaining", "ratelimit-reset", "retry-after"].map((name) =>
    response.headers.get(name),
  );
}

describe("rateLimiter", async () => {
  await setupPlayground();

  it("allows N attempts per window, rejects the next, and resets after the window", async () => {
    const body = await guest().$fetch("/api/_rate-limit-check");

    expect(body).toEqual({
      withinWindow: ["allowed", "allowed", "allowed", "rejected"],
      otherKey: "allowed",
      afterWindow: "allowed",
    });
  });

  it("sends RateLimit-Limit, -Remaining and -Reset on a limited route, and Retry-After on its 429", async () => {
    const headers = { "x-probe-key": "headers" };
    const responses = [];
    for (let i = 0; i < 3; i++) responses.push(await guest().fetch("/api/_rate-limit-route", { headers }));

    expect(responses.map((response) => rateLimitHeaders(response))).toEqual([
      ["2", "1", expect.stringMatching(/^\d+$/), null],
      ["2", "0", expect.stringMatching(/^\d+$/), null],
      ["2", "0", expect.stringMatching(/^\d+$/), expect.stringMatching(/^\d+$/)],
    ]);
  });

  it("sends the same headers from a tRPC procedure", async () => {
    const headers = { "x-probe-key": "trpc-headers" };
    const allowed = await guest().fetch("/api/trpc/_rateLimitCheck.byKey", { headers });
    await guest().fetch("/api/trpc/_rateLimitCheck.byKey", { headers });
    const rejected = await guest().fetch("/api/trpc/_rateLimitCheck.byKey", { headers });

    expect(rateLimitHeaders(allowed).slice(0, 2)).toEqual(["2", "1"]);
    expect(rateLimitHeaders(rejected).slice(0, 2)).toEqual(["2", "0"]);
  });
});
