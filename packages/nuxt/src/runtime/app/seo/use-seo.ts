import { useSeoMeta } from "#app";
import { type MaybeRefOrGetter, computed, toValue } from "vue";

/** The page metadata {@link useSeo} sets. */
export interface SeoMeta {
  /** The page title. The `nuxvel.seo` title template adds the site name to `<title>`. */
  title: string;
  /** `description`, `og:description` and `twitter:description`. Without it, the site default stays. */
  description?: string;
  /** `og:image` and `twitter:image`: a path or an absolute URL. Without it, the site default stays. */
  image?: string;
  /** `og:type`. The default is `website`. */
  type?: "article" | "website";
  /** `true` adds `<meta name="robots" content="noindex, nofollow">`. */
  noindex?: boolean;
}

/**
 * Sets the title, description, image and Open Graph and Twitter tags of
 * the current page in one call.
 *
 * Auto-imported in `app/`. Call it in a page's `setup()`. Pass a getter
 * when a value comes from data that loads, so the tags follow it on the
 * server and after each client navigation. With `nuxvel.seo` set, the
 * title gets the site name, and the page gets its canonical link and
 * the site defaults for what it leaves out. With `nuxvel.seo.ogImage`,
 * the page also gets a generated Open Graph image. It is a thin wrapper over
 * Nuxt's `useSeoMeta()`: use that for any other tag.
 *
 * @example
 * ```ts
 * const post = $api.post.byId.useQuery({ id });
 *
 * useSeo(() => ({
 *   title: post.data?.title ?? "Post",
 *   description: post.data?.body.slice(0, 160),
 *   type: "article",
 * }));
 * ```
 */
export function useSeo(meta: MaybeRefOrGetter<SeoMeta>) {
  const seo = computed(() => toValue(meta));

  useSeoMeta({
    title: () => seo.value.title,
    ogTitle: () => seo.value.title,
    twitterTitle: () => seo.value.title,
    description: () => seo.value.description,
    ogDescription: () => seo.value.description,
    twitterDescription: () => seo.value.description,
    ogImage: () => seo.value.image,
    twitterImage: () => seo.value.image,
    ogType: () => seo.value.type ?? "website",
    robots: () => (seo.value.noindex ? "noindex, nofollow" : undefined),
  });
}
