import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";

describe("an app with no nuxvel.seo", () => {
  it("serves no robots.txt and no sitemap.xml", async () => {
    expect(await (await guest().fetch("/robots.txt")).text()).not.toContain("User-agent");
    expect(await (await guest().fetch("/sitemap.xml")).text()).not.toContain("<urlset");
  });

  it("adds no canonical link and no Open Graph tags", async () => {
    const html = await guest().$fetch<string>("/");

    expect(html).not.toContain('rel="canonical"');
    expect(html).not.toContain("og:");
  });
});
