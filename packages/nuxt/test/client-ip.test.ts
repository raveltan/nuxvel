import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";

describe("clientIp without trustProxy", async () => {
  await setupPlayground();

  it("ignores forwarded headers, so a forged one does not change the rate-limit key", async () => {
    const forged = { "x-forwarded-for": "203.0.113.9", "forwarded": "for=198.51.100.7" };
    const body = await guest().$fetch<{ clientIp: string }>("/api/_client-ip", { headers: forged });
    const first = await guest().fetch("/api/_rate-limit-route-by-ip", { headers: { "x-forwarded-for": "203.0.113.10" } });
    const second = await guest().fetch("/api/_rate-limit-route-by-ip", { headers: { "x-forwarded-for": "203.0.113.11" } });

    expect(body.clientIp).toMatch(/^(::ffff:)?127\.0\.0\.1$|^::1$/);
    expect([first.status, second.status]).toEqual([200, 429]);
  });
});
