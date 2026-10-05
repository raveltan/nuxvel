import { describe, it } from "vitest";
import { actingAs, exhaustRateLimit, expect, guest } from "@nuxvel/nuxt/testing";
import { $rateLimits } from "#nuxvel/test-namespaces";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

describe("shared rate limits in server/rate-limits/", async () => {
  await setupPlayground();

  it("shares one budget per key between every use of a limit, by name or by definition", async () => {
    const headers = { "x-probe-key": "shared-a" };
    const byName = await guest().fetch("/api/_rate-limit-shared-by-name", { headers });
    const fromAction = await guest().fetch("/api/_rate-limit-action?shared=shared-a");
    const byDefinition = await guest().fetch("/api/_rate-limit-shared-by-definition", { headers });
    const otherKey = await guest().fetch("/api/_rate-limit-shared-by-definition", { headers: { "x-probe-key": "shared-b" } });

    expect([byName.status, fromAction.status, byDefinition.status]).toEqual([200, 200, 429]);
    expect(Number(byDefinition.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(otherKey.status).toBe(200);
  });

  it("keys a by function and rateLimiter().consume(key) in one namespace, given the limit's definition", async () => {
    const email = "shared@example.com";
    const fromAction = await guest().fetch(`/api/_rate-limit-action?shared=${email}`);
    const fromLimiter = await guest().fetch(`/api/_rate-limit-shared-by-limiter?key=${email}`);
    const again = await guest().fetch(`/api/_rate-limit-action?shared=${email}`);

    expect([fromAction.status, fromLimiter.status, again.status]).toEqual([200, 200, 429]);
  });

  it("refuses the next attempt after exhaustRateLimit(), for that key only, given its name or its stub", async () => {
    await exhaustRateLimit("_shared-probe", "shared-c");

    const exhausted = await guest().fetch("/api/_rate-limit-shared-by-name", { headers: { "x-probe-key": "shared-c" } });
    const otherKey = await guest().fetch("/api/_rate-limit-shared-by-name", { headers: { "x-probe-key": "shared-d" } });

    expect([exhausted.status, otherKey.status]).toEqual([429, 200]);
  });

  it("spends the login limit for one IP only, given its stub", async () => {
    await exhaustRateLimit($rateLimits.login, { ip: "203.0.113.9" });
    const otherIp = await guest().fetch("/api/_rate-limit-login");

    await exhaustRateLimit($rateLimits.login, { ip: "127.0.0.1" });
    const ownIp = await guest().fetch("/api/_rate-limit-login");

    expect([otherIp.status, ownIp.status]).toEqual([200, 429]);
  });

  it("spends the shared limit of one user, given { user }", async () => {
    const [alice, bob] = [await userFactory(), await userFactory()];

    await exhaustRateLimit("_shared-probe", { user: alice });

    await expect(actingAs(alice).trpc._rateLimitCheck.sharedByUser()).rejects.toBeTrpcError("TOO_MANY_REQUESTS");
    await expect(actingAs(bob).trpc._rateLimitCheck.sharedByUser()).resolves.toBe(bob.id);
  });
});
