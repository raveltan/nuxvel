import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { url } from "@nuxt/test-utils/e2e";
import { setupPlayground } from "./helpers/playground";

describe("origin-checked mutations", async () => {
  await setupPlayground();

  async function echo(origin: string | undefined, headers: Record<string, string> = {}) {
    return guest().fetch("/api/trpc/health.echo", {
      method: "POST",
      headers: { "content-type": "application/json", ...(origin ? { origin } : {}), ...headers },
      body: JSON.stringify({ json: "hello" }),
    });
  }

  it("rejects a mutation from a foreign origin", async () => {
    const response = await echo("https://evil.example.com");

    expect(response.status).toBe(403);
    expect(await response.text()).toContain("Cross-origin mutation rejected");
  });

  it("accepts a mutation from the app's own origin", async () => {
    const response = await echo(new URL(url("/")).origin);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      result: { data: { json: "hello" } },
    });
  });

  it("compares the origin with the forwarded host behind a proxy", async () => {
    const proxied = await echo("https://app.example.com", {
      "x-forwarded-host": "app.example.com",
    });
    const foreign = await echo("https://evil.example.com", {
      "x-forwarded-host": "app.example.com",
    });

    expect(proxied.status).toBe(200);
    expect(foreign.status).toBe(403);
  });

  it("rejects a mutation that a browser marks cross-site or same-site, without an Origin", async () => {
    for (const site of ["cross-site", "same-site"]) {
      const response = await echo(undefined, { "sec-fetch-site": site });

      expect(response.status).toBe(403);
      expect(await response.text()).toContain("Cross-origin mutation rejected");
    }
  });

  it("accepts a mutation that a browser marks same-origin or none", async () => {
    for (const site of ["same-origin", "none"]) {
      expect((await echo(undefined, { "sec-fetch-site": site })).status).toBe(200);
    }
  });

  it("rejects a cross-site request to a REST endpoint", async () => {
    const response = await guest().fetch("/api/v1/posts", {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "cross-site" },
      body: "{}",
    });

    expect(response.status).toBe(403);
  });

  it("rejects a mutation that useCaller() runs inside a cross-site request", async () => {
    const crossSite = await guest().fetch("/api/_use-caller-mutation-check", { headers: { "sec-fetch-site": "cross-site" } });
    const plain = await guest().fetch("/api/_use-caller-mutation-check");

    expect(await crossSite.json()).toEqual({ code: "FORBIDDEN" });
    expect(await plain.json()).toEqual({ echoed: "hello" });
  });
});
