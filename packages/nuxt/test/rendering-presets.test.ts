import { actingAs, expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

async function sentinelHits(mode: string) {
  const { hits } = await guest().$fetch<{ hits: number }>(
    "/api/_rendering-sentinel-check",
    { query: { mode } },
  );

  return hits;
}

describe("rendering presets", async () => {
  await setupPlayground();

  it("server-renders a route without a preset on every request", async () => {
    await guest().$fetch("/_rendering/ssr");
    const html = await guest().$fetch<string>("/_rendering/ssr");

    expect(html).toContain("rendering:ssr");
    expect(await sentinelHits("ssr")).toBe(2);
  });

  it("never runs a client route on the server", async () => {
    const response = await guest().fetch("/_rendering/client");

    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain("rendering:client");
    expect(await sentinelHits("client")).toBe(0);
  });

  it("renders a private route on every request, uncacheable and unindexed", async () => {
    await guest().fetch("/_rendering/private");
    const response = await guest().fetch("/_rendering/private");

    expect(await response.text()).toContain("rendering:private");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    expect(await sentinelHits("private")).toBe(2);
  });

  it("serves a cached route from the cache after the first render", async () => {
    await guest().fetch("/_rendering/cached");
    const response = await guest().fetch("/_rendering/cached");

    expect(await response.text()).toContain("rendering:cached");
    expect(response.headers.get("cache-control")).toBe(
      "s-maxage=60, stale-while-revalidate",
    );
    expect(await sentinelHits("cached")).toBe(1);
  });

  it("marks every API answer private, a tRPC batch and a REST call included", async () => {
    for (const path of ["/api/trpc/post.list,post.list?batch=1", "/api/v1/posts", "/api/health/live"]) {
      const response = await guest().fetch(path);

      expect(response.status, path).toBe(200);
      expect(response.headers.get("cache-control"), path).toBe("private, no-store");
    }
  });

  it("sends each page rendered for a signed-in visitor private, and leaves it shareable for a guest", async () => {
    const user = await userFactory({ email: "rendering-signed-in@example.com" });
    const signedIn = await actingAs(user).fetch("/");
    const signedOut = await guest().fetch("/");

    expect(signedIn.headers.get("cache-control")).toBe("private, no-store");
    expect(signedOut.headers.get("cache-control")).toBeNull();
  });

  it("keeps serving a cached route from the shared copy to a signed-in visitor", async () => {
    const client = actingAs(await userFactory({ email: "rendering-cached-signed-in@example.com" }));
    await client.fetch("/_rendering/cached");
    const response = await client.fetch("/_rendering/cached");

    expect(response.headers.get("cache-control")).toBe("s-maxage=60, stale-while-revalidate");
  });

  it("does not let a cached route keep a 404", async () => {
    const headers = { accept: "text/html" };
    const first = await guest().fetch("/_rendering-gone/x", { headers });
    const second = await guest().fetch("/_rendering-gone/x", { headers });

    expect(first.status).toBe(404);
    expect(second.status).toBe(404);
    expect(first.headers.get("cache-control")).toBe("no-store");
    expect(second.headers.get("cache-control")).toBe("no-store");
    expect(await sentinelHits("gone")).toBe(2);
  });
});
