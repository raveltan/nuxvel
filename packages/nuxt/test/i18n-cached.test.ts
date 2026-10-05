import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";

describe("i18n on cached pages", async () => {
  await setupPlayground();

  it.for(["/_rendering/cached", "/zh/_rendering/cached"])("sends the shared copy of %s with no cookie, on the first render and from the cache", async (path) => {
    for (const response of [await guest().fetch(path), await guest().fetch(path)]) {
      expect(response.headers.get("cache-control")).toBe("s-maxage=60, stale-while-revalidate");
      expect(response.headers.get("set-cookie")).toBeNull();
    }
  });

  it("gives a Chinese visitor the same shared copy of a cached page, with no redirect", async () => {
    const response = await guest().fetch("/_rendering/cached", { headers: { "accept-language": "zh-CN", cookie: "user-locale=zh" }, redirect: "manual" });

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it.for([{ "accept-language": "zh-CN" }, { cookie: "user-locale=zh" }])("still redirects / of a page that is not cached to /zh for %o", async (headers) => {
    const response = await guest().fetch("/", { headers, redirect: "manual" });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/zh");
  });

  it("still sets the locale cookie on a /zh page that is not cached", async () => {
    const response = await guest().fetch("/zh/_i18n");

    expect(response.headers.get("set-cookie")).toContain("user-locale=zh");
  });
});
