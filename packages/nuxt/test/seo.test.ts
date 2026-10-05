import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";
import { getServerLogs, startServer, stopServer, url } from "@nuxt/test-utils/e2e";
import { expect, getMeta, guest, renderMail, visit } from "@nuxvel/nuxt/testing";
import { postFactory } from "../../../playground/server/factories/posts.factory";
import { setupApp } from "./helpers/playground";

describe("nuxvel.seo", async () => {
  await setupApp({
    rootDir: fileURLToPath(new URL("../../../playground", import.meta.url)),
    browser: true,
    env: { NUXT_SITE_URL: "https://blog.example.com" },
    nuxtConfig: {
      nuxvel: {
        seo: {
          siteName: "The Blog",
          siteUrl: "https://blog.example.com",
          defaultDescription: "Notes on building web apps.",
          defaultImage: "/og.png",
          twitter: "@theblog",
          ogImage: true,
        },
      },
      site: { env: "production" },
      app: { head: { title: "" } },
    },
  });

  it("shows the site name in the mail layout", async () => {
    const { text } = await renderMail("welcome", { to: "ada@example.com", name: "Ada" });

    expect(text).toContain("Sent by The Blog.");
  });

  it("renders the title template, the canonical link and the default meta tags", async () => {
    const html = await guest().$fetch<string>("/sign-in");

    expect(html).toContain("<title>The Blog</title>");
    expect(html).toMatch(/<link [^>]*rel="canonical" href="https:\/\/blog\.example\.com\/sign-in">/);
    expect(html).toMatch(/<meta [^>]*property="og:url" content="https:\/\/blog\.example\.com\/sign-in">/);
    expect(html).toContain('<meta name="description" content="Notes on building web apps.">');
    expect(html).toContain('<meta property="og:site_name" content="The Blog">');
    expect(html).toContain('<meta property="og:type" content="website">');
    expect(html).toContain('<meta property="og:image" content="https://blog.example.com/og.png">');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(html).toContain('<meta name="twitter:site" content="@theblog">');
  });

  it("serves a robots.txt that allows crawling and points at the sitemap", async () => {
    const robots = await guest().$fetch<string>("/robots.txt");

    expect(robots).toContain("User-agent: *");
    expect(robots).not.toMatch(/^Disallow: \/$/m);
    expect(robots).toContain("Sitemap: https://blog.example.com/sitemap_index.xml");
  });

  it("redirects /sitemap.xml to an index with one sitemap for each locale", async () => {
    const response = await guest().fetch("/sitemap.xml", { redirect: "manual" });
    const index = await guest().$fetch<string>("/sitemap_index.xml", { responseType: "text" });

    expect(response.headers.get("location")).toMatch(/\/sitemap_index\.xml$/);
    expect(index).toContain("<loc>https://blog.example.com/__sitemap__/en-US.xml</loc>");
    expect(index).toContain("<loc>https://blog.example.com/__sitemap__/zh-CN.xml</loc>");
  });

  it.for([
    ["en-US", "https://blog.example.com/sign-in"],
    ["zh-CN", "https://blog.example.com/zh/sign-in"],
  ])("lists the public pages of %s with their alternates and leaves out private ones", async ([locale, signIn]) => {
    const sitemap = await guest().$fetch<string>(`/__sitemap__/${locale}.xml`, { responseType: "text" });

    expect(sitemap).toContain(`<loc>${signIn}</loc>`);
    expect(sitemap).toContain('href="https://blog.example.com/sign-in" hreflang="en-US"');
    expect(sitemap).toContain('href="https://blog.example.com/zh/sign-in" hreflang="zh-CN"');
    expect(sitemap).toContain('href="https://blog.example.com/sign-in" hreflang="x-default"');
    expect(sitemap).not.toContain("/protected</loc>");
    expect(sitemap).not.toContain("/profile</loc>");
  });

  it("gives a page the canonical link, og:url and lang of its locale with hreflang alternates", async () => {
    const meta = await getMeta("/zh/sign-in");
    const html = await guest().$fetch<string>("/zh/sign-in");

    expect(meta.canonical).toBe("https://blog.example.com/zh/sign-in");
    expect(meta["og:url"]).toBe("https://blog.example.com/zh/sign-in");
    expect(html).toMatch(/<html [^>]*lang="zh-CN"/);
    expect(html.match(/rel="canonical"/g)).toHaveLength(1);
    expect(html.match(/property="og:url"/g)).toHaveLength(1);
    expect(html).toContain('rel="alternate" href="https://blog.example.com/sign-in" hreflang="en-US"');
    expect(html).toContain('rel="alternate" href="https://blog.example.com/zh/sign-in" hreflang="zh-CN"');
    expect(html).toContain('rel="alternate" href="https://blog.example.com/sign-in" hreflang="x-default"');
  });

  it("keeps the offline page out of the sitemap and marks it noindex", async () => {
    const sitemap = await guest().$fetch<string>("/__sitemap__/en-US.xml", { responseType: "text" });
    const response = await guest().fetch("/offline");

    expect(sitemap).not.toContain("/offline</loc>");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    expect(await response.text()).toMatch(/<meta [^>]*name="robots" content="[^"]*noindex/);
  });

  it("tells crawlers not to index a page behind the auth middleware", async () => {
    const response = await guest().fetch("/protected", { redirect: "manual" });

    expect(response.headers.get("x-robots-tag")).toContain("noindex");
  });

  it("reads the head tags of a page with getMeta()", async () => {
    const post = await postFactory({ title: "Tom & Jerry", body: "A body that runs on." });

    const meta = await getMeta(`/posts/${post.id}`);

    expect(meta.title).toBe("Tom & Jerry · The Blog");
    expect(meta["og:title"]).toBe("Tom & Jerry");
    expect(meta.description).toBe("A body that runs on.");
    expect(meta["og:site_name"]).toBe("The Blog");
    expect(meta.canonical).toBe(`https://blog.example.com/posts/${post.id}`);
  });

  it("renders a post's own title, description and type from useSeo() on the server", async () => {
    const post = await postFactory({ title: "First post", body: "A body that runs on." });

    const html = await guest().$fetch<string>(`/posts/${post.id}`);

    expect(html).toContain("<title>First post · The Blog</title>");
    expect(html).toContain('<meta property="og:title" content="First post">');
    expect(html).toContain('<meta name="twitter:title" content="First post">');
    expect(html).toContain('<meta name="description" content="A body that runs on.">');
    expect(html).toContain('<meta property="og:description" content="A body that runs on.">');
    expect(html).toContain('<meta property="og:type" content="article">');
    expect(html).not.toContain('content="Notes on building web apps."');
  });

  it("updates the head after a client navigation", async () => {
    const post = await postFactory({ title: "Second post", body: "Another body." });
    const page = await visit(`/posts/${post.id}`);
    const canonical = page.locator('link[rel="canonical"]');

    expect(await page.title()).toBe("Second post · The Blog");

    await page.getByRole("link", { name: "Home" }).click();
    await page.waitForURL(url("/"));

    await expect.poll(() => page.title()).toBe("The Blog");
    await expect.poll(() => canonical.getAttribute("href")).toBe("https://blog.example.com/");
    expect(await page.locator('meta[property="og:type"]').getAttribute("content")).toBe("website");
  });

  it("renders a post's Open Graph image from the Default template", async () => {
    const post = await postFactory({ title: "Third post", body: "A body." });
    const html = await guest().$fetch<string>(`/posts/${post.id}`);
    const image = html.match(/<meta property="og:image" content="([^"]+)">/)?.[1];

    expect(image).toMatch(/^https:\/\/blog\.example\.com\/_og\//);

    const response = await guest().fetch(new URL(image ?? "").pathname);
    const bytes = new Uint8Array(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect([...bytes.slice(1, 4)]).toEqual([0x50, 0x4e, 0x47]);
  });

  it("refuses to boot in production without NUXT_OG_IMAGE_SECRET when ogImage is on", async () => {
    await stopServer();

    try {
      await expect(startServer({ env: { NODE_ENV: "production", NUXT_OG_IMAGE_SECRET: "", NUXT_OG_IMAGE_SECRET_REQUIRED: "true" } })).rejects.toThrow();
      expect(getServerLogs().join("\n")).toContain("NUXT_OG_IMAGE_SECRET: Required in production");
    } finally {
      await startServer();
    }
  }, 120000);
});
