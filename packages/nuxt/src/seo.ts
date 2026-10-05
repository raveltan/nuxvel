import type { NuxtOptions, NuxtPage } from "@nuxt/schema";
import { defu } from "defu";
import { authedPatterns, type RouteRules } from "./private-page-guard";

/**
 * Site-wide SEO defaults, set under `nuxvel.seo`.
 */
export interface SeoOptions {
  /** The site name. It ends every `<title>` and fills `og:site_name`. */
  siteName: string;
  /**
   * The public origin, for example `https://blog.example.com`. Canonical
   * URLs, `og:url`, image URLs and the sitemap start with it. Without
   * it, the origin of the request is used. `NUXT_SITE_URL` overrides it
   * at runtime.
   */
  siteUrl?: string;
  /** The `description` and `og:description` of a page that sets none. */
  defaultDescription?: string;
  /** The `og:image` of a page that sets none: a path or an absolute URL. */
  defaultImage?: string;
  /** The site's X (Twitter) handle for `twitter:site`, for example `@nuxvel`. */
  twitter?: string;
  /**
   * `false` asks every crawler to stay away: `robots.txt` disallows all
   * paths and each page is `noindex`. Outside production this is always
   * so.
   *
   * @defaultValue `true`
   */
  indexable?: boolean;
  /**
   * Installs `nuxt-og-image`, so {@link useSeo} renders the Open Graph
   * image of a page that passes no `image` from the app's
   * `app/components/OgImage/Default.takumi.vue`. The app installs
   * `nuxt-og-image` and `@takumi-rs/core` itself.
   *
   * @defaultValue `false`
   */
  ogImage?: boolean;
}

/** The `nuxt-site-config` options the robots and sitemap modules read. */
export function siteConfig(seo: SeoOptions) {
  return {
    name: seo.siteName,
    url: seo.siteUrl,
    description: seo.defaultDescription,
    ...(seo.indexable === false ? { indexable: false } : {}),
  };
}

/** The `app.head` defaults every page starts from. */
export function siteHead(seo: SeoOptions): NuxtOptions["app"]["head"] {
  const meta = [
    { name: "description", content: seo.defaultDescription },
    { property: "og:site_name", content: seo.siteName },
    { property: "og:type", content: "website" },
    { property: "og:description", content: seo.defaultDescription },
    { property: "og:image", content: seo.defaultImage },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:site", content: seo.twitter },
  ];

  return {
    titleTemplate: "%s %separator %siteName",
    templateParams: { separator: "·", siteName: seo.siteName },
    meta: meta.filter((tag): tag is typeof tag & { content: string } => tag.content !== undefined),
  };
}

/**
 * Marks every page behind the `auth` middleware, and every route whose
 * rules already say `noindex`, as `robots: false`, which keeps it out of
 * the sitemap and makes it `noindex`.
 */
export function hidePrivatePages(pages: NuxtPage[], routeRules: RouteRules) {
  const noindex = Object.keys(routeRules).filter((pattern) =>
    routeRules[pattern]?.headers?.["x-robots-tag"]?.includes("noindex"),
  );

  for (const pattern of new Set([...authedPatterns(pages), ...noindex])) {
    routeRules[pattern] = defu(routeRules[pattern], { robots: false });
  }
}
