import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { createPage, url } from "@nuxt/test-utils/e2e";

export const LAN_HOST = "nuxvel-dev.test";

function throughLanHost(path: string) {
  const target = new URL(url(path));
  target.hostname = LAN_HOST;

  return target.href;
}

describe("the dev server reached over plain HTTP", () => {
  it("asks the browser neither to upgrade requests nor to remember HTTPS", async () => {
    const response = await guest().fetch("/");

    expect(response.headers.get("content-security-policy")).not.toContain("upgrade-insecure-requests");
    expect(response.headers.get("strict-transport-security")).toBeNull();
  });

  it("loads every asset through a host other than localhost", async () => {
    const page = await createPage();
    const failed: string[] = [];

    page.on("requestfailed", (request) => failed.push(`${request.url()} ${request.failure()?.errorText}`));
    await page.goto(throughLanHost("/"), { waitUntil: "hydration" });

    expect(failed).toEqual([]);
  }, 60_000);
});
