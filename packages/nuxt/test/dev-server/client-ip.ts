import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";

describe("clientIp in the dev server", () => {
  it("is the address of the client, not unknown behind the dev worker's proxy", async () => {
    const direct = await guest().$fetch<{ clientIp: string | null }>("/api/_client-ip");
    const throughPortless = await guest().$fetch<{ clientIp: string | null }>("/api/_client-ip", {
      headers: { "x-forwarded-for": "203.0.113.9" },
    });

    expect(direct.clientIp).toMatch(/^(::ffff:)?127\.0\.0\.1$|^::1$/);
    expect(throughPortless.clientIp).toBe("203.0.113.9");
  });
});
