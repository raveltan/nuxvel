import { describe, it } from "vitest";
import { actingAs, exhaustRateLimit, expect, guest } from "@nuxvel/nuxt/testing";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

async function statuses(path: string, times: number, headers: Record<string, string> = {}) {
  const responses: Response[] = [];

  for (let i = 0; i < times; i++) responses.push(await guest().fetch(path, { headers }));

  return responses;
}

describe("rateLimit() at the point of use", async () => {
  await setupPlayground();

  it("limits an h3 handler through onRequest and answers the taxonomy 429", async () => {
    const [first, second, third] = await statuses("/api/_rate-limit-route", 3, { "x-probe-key": "route-a" });
    const otherKey = await guest().fetch("/api/_rate-limit-route", { headers: { "x-probe-key": "route-b" } });

    expect([first?.status, second?.status, third?.status]).toEqual([200, 200, 429]);
    expect(Number(third?.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await third?.json()).toMatchObject({
      statusCode: 429,
      data: { code: "TOO_MANY_REQUESTS", retryAfter: expect.any(Number) },
    });
    expect(otherKey.status).toBe(200);
  });

  it("keys a handler by client IP, and by user only for a signed-in request", async () => {
    const byIp = await statuses("/api/_rate-limit-route-by-ip", 2);
    const signedOut = await guest().fetch("/api/_rate-limit-route-by-user");

    expect(byIp.map((response) => response.status)).toEqual([200, 429]);
    expect(signedOut.status).toBe(401);
  });

  it("limits a tRPC procedure by its path through .use()", async () => {
    const responses = await statuses("/api/trpc/_rateLimitCheck.byKey", 3, { "x-probe-key": "trpc-a" });
    const rejected = responses[2];

    expect(responses.map((response) => response.status)).toEqual([200, 200, 429]);
    expect(Number(rejected?.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await rejected?.json()).toMatchObject({
      error: { json: { data: { code: "TOO_MANY_REQUESTS", retryAfter: expect.any(Number) } } },
    });
  });

  it("limits an authed procedure per user", async () => {
    const [alice, bob] = [await userFactory(), await userFactory()];

    await expect(actingAs(alice).api._rateLimitCheck.byUser()).resolves.toBe(alice.id);
    await expect(actingAs(alice).api._rateLimitCheck.byUser()).rejects.toBeTrpcError("TOO_MANY_REQUESTS");
    await expect(actingAs(bob).api._rateLimitCheck.byUser()).resolves.toBe(bob.id);
  });

  it("spends the inline limit of a procedure for the identity of the test client", async () => {
    const [alice, bob] = [await userFactory(), await userFactory()];

    await exhaustRateLimit(actingAs(alice).api._rateLimitCheck.byUser);
    await exhaustRateLimit(guest().api._rateLimitCheck.byKey);

    await expect(actingAs(alice).api._rateLimitCheck.byUser()).rejects.toBeTrpcError("TOO_MANY_REQUESTS");
    await expect(guest().api._rateLimitCheck.byKey()).rejects.toBeTrpcError("TOO_MANY_REQUESTS");
    await expect(actingAs(bob).api._rateLimitCheck.byUser()).resolves.toBe(bob.id);
  });

  it("limits an action by its rateLimit option, keyed by its name", async () => {
    const limited = await statuses("/api/_rate-limit-action?key=action-a", 3);
    const otherKey = await guest().fetch("/api/_rate-limit-action?key=action-b");

    expect(limited.map((response) => response.status)).toEqual([200, 200, 429]);
    expect(Number(limited[2]?.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(otherKey.status).toBe(200);
  });

  it("counts the guest actor of an action limited by user by its IP", async () => {
    const limited = await statuses("/api/_rate-limit-action?guest", 2);

    expect(limited.map((response) => response.status)).toEqual([200, 429]);
  });

  it("refuses an action limited by user when a system actor calls it", async () => {
    const response = await guest().fetch("/api/_rate-limit-action");

    expect(await response.json()).toEqual({
      refused: expect.stringContaining('is rate limited by "user", but a "system" actor'),
    });
  });
});
