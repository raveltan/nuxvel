import { CanonicalPlugin } from "@unhead/vue/plugins";
import { defineNuxtPlugin, injectHead } from "#app";
import { useSiteConfig } from "#imports";

/**
 * Turns every relative canonical, `og:url` and `og:image` into an
 * absolute URL on the site's origin. Added only with `nuxvel.seo`.
 */
export default defineNuxtPlugin({
  name: "nuxvel:seo-absolute-urls",
  setup() {
    injectHead().use(CanonicalPlugin({ canonicalHost: useSiteConfig().url }));
  },
});
