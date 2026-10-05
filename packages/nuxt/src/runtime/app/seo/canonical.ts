import { defineNuxtPlugin, useHead, useRoute } from "#app";

/**
 * Gives each page a canonical link and an `og:url` for its own path.
 * Added only with `nuxvel.seo` and without the i18n meta, which adds
 * both for the locale of the page.
 */
export default defineNuxtPlugin({
  name: "nuxvel:seo-canonical",
  setup() {
    const route = useRoute();

    useHead({
      link: [{ rel: "canonical", href: () => route.path }],
      meta: [{ property: "og:url", content: () => route.path }],
    });
  },
});
