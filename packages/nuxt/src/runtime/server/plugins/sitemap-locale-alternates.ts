import type { SitemapInputCtx } from "@nuxtjs/sitemap";
import { defineNitroPlugin } from "nitropack/runtime";

interface SitemapHooks {
  hook(name: "sitemap:input", handler: (ctx: SitemapInputCtx) => void): void;
}

export default defineNitroPlugin((nitro) => {
  // @nuxtjs/sitemap types its hooks only in an app that installs it
  const hooks = nitro.hooks as unknown as SitemapHooks;
  hooks.hook("sitemap:input", (ctx) => {
    for (const url of ctx.urls) {
      // @nuxtjs/sitemap groups the nuxt-i18n-micro copy of a page apart from the page, so the copy lists only itself; without it the sitemap lists every locale
      if (typeof url !== "string" && url.alternatives?.every((alternate) => String(alternate.href) === url.loc)) delete url.alternatives;
    }
  });
});
