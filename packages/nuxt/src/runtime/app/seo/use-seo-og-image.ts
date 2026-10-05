import { defineOgImage, useSiteConfig } from "#imports";
import { type MaybeRefOrGetter, toValue } from "vue";
import { type SeoMeta, useSeo as useSeoMeta } from "./use-seo";

/**
 * Sets the title, description, image and Open Graph and Twitter tags of
 * the current page in one call, and renders its Open Graph image.
 *
 * Auto-imported in `app/` in place of the plain `useSeo()` when
 * `nuxvel.seo.ogImage` is `true` and `ssr` is not `false`. When `image` has no value at the first
 * call, the page's `og:image` is a PNG that `nuxt-og-image` renders from
 * `app/components/OgImage/Default.takumi.vue`, with the page title, its
 * description and the site name as props.
 *
 * @example
 * ```ts
 * useSeo(() => ({ title: post.data.value?.title ?? "Post", type: "article" }));
 * ```
 */
export function useSeo(meta: MaybeRefOrGetter<SeoMeta>) {
  useSeoMeta(meta);

  if (toValue(meta).image) return;

  defineOgImage("Default", { siteName: useSiteConfig().name });
}
