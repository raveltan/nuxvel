import { networkInterfaces } from "node:os";
import { expect } from "@nuxvel/nuxt/testing";
import { describe, it, onTestFinished } from "vitest";
import { startSecondServer } from "./helpers/second-server";

function outsideAddress() {
  const address = Object.values(networkInterfaces())
    .flat()
    .find((entry) => entry?.family === "IPv4" && !entry.internal)?.address;

  if (!address) throw new Error("this machine has no IPv4 address outside loopback");

  return address;
}

describe('clientIp with trustProxy: "loopback"', () => {
  it("reads the last X-Forwarded-For address only on a request from this machine, as from Caddy on a VPS", { timeout: 40_000 }, async () => {
    const server = await startSecondServer({ env: { HOST: "0.0.0.0", NUXT_NUXVEL_SECURITY_TRUST_PROXY: "loopback" } });
    onTestFinished(() => server.stop());
    const clientIp = async (host: string) => {
      const url = new URL("/api/_client-ip", server.url);
      url.hostname = host;
      const response = await fetch(url, {
        headers: { forwarded: "for=192.0.2.66", "x-forwarded-for": "203.0.113.9, 198.51.100.7" },
      });

      return ((await response.json()) as { clientIp: string }).clientIp;
    };

    expect(await clientIp("127.0.0.1")).toBe("198.51.100.7");
    expect(await clientIp(outsideAddress())).toMatch(new RegExp(`^(::ffff:)?${outsideAddress().replaceAll(".", "\\.")}$`));
  });
});
