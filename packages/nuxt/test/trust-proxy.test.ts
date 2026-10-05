import { afterEach, describe, it } from "vitest";
import { expect, guest, startMaintenance, stopMaintenance } from "@nuxvel/nuxt/testing";
import { postJson } from "./helpers/auth-flows";
import { setupPlayground } from "./helpers/playground";

function clientIpOf(headers: Record<string, string>) {
  return guest().$fetch<{ clientIp: string }>("/api/_client-ip", { headers }).then((body) => body.clientIp);
}

describe("clientIp with trustProxy: 2", async () => {
  await setupPlayground({ env: { NUXT_NUXVEL_SECURITY_TRUST_PROXY: "2" } });

  afterEach(() => stopMaintenance());

  it("takes the address two proxies from the right, so a forged leftmost entry is ignored", async () => {
    await expect(clientIpOf({ "x-forwarded-for": "203.0.113.9, 198.51.100.7" })).resolves.toBe("203.0.113.9");
    await expect(clientIpOf({ "x-forwarded-for": "1.1.1.1, 203.0.113.9, 198.51.100.7" })).resolves.toBe(
      "203.0.113.9",
    );
  });

  it("ignores a client-sent Forwarded header and reads X-Forwarded-For", async () => {
    await expect(
      clientIpOf({ forwarded: "for=9.9.9.9", "x-forwarded-for": "1.1.1.1, 2.2.2.2, 198.51.100.7" }),
    ).resolves.toBe("2.2.2.2");
  });

  it("refuses the fifth sign-in from one X-Forwarded-For client when each attempt sends a new Forwarded address", async () => {
    const statuses: number[] = [];

    for (let i = 1; i <= 5; i++) {
      const response = await postJson(
        "/api/auth/sign-in/email",
        { email: "forwarded-forger@example.com", password: "wrong-password-entirely" },
        { forwarded: `for=192.0.2.${i}`, "x-forwarded-for": "198.51.100.30, 198.51.100.7" },
      );

      statuses.push(response.status);
    }

    expect(statuses).toEqual([401, 401, 401, 401, 429]);
  });

  it("keys IPv6 clients by their /64 prefix, so two addresses in one /64 share a budget", async () => {
    const status = async (address: string) =>
      (await guest().fetch("/api/_rate-limit-route-by-ip", { headers: { "x-forwarded-for": `${address}, 198.51.100.7` } }))
        .status;

    expect(await status("2001:db8:aa:1::1")).toBe(200);
    expect(await status("2001:0db8:00aa:0001:ffff:1:2:3")).toBe(429);
    expect(await status("2001:db8:aa:2::1")).toBe(200);
  });

  it("admits a maintenance allow-listed IP from the forwarded address", async () => {
    await startMaintenance({ allow: ["203.0.113.9"] });

    const status = async (forwarded: string) =>
      (await guest().fetch("/api/flags", { headers: { "x-forwarded-for": `${forwarded}, 198.51.100.7` } })).status;

    expect(await status("203.0.113.9")).toBe(200);
    expect(await status("203.0.113.10")).toBe(503);
  });
});
