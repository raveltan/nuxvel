import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";

describe("security headers", async () => {
  await setupPlayground();

  it("serves a strict Content-Security-Policy on a page response", async () => {
    const response = await guest().fetch("/");
    const policy = response.headers.get("content-security-policy");

    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("'strict-dynamic'");
  });

  it("upgrades insecure requests and pins HTTPS outside development", async () => {
    const response = await guest().fetch("/");

    expect(response.headers.get("content-security-policy")).toContain("upgrade-insecure-requests");
    expect(response.headers.get("strict-transport-security")).toBe("max-age=31536000; includeSubDomains; preload");
  });
});
