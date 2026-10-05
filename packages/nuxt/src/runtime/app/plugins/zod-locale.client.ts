import { z } from "zod";
import { defineNuxtPlugin } from "#app";
import zodLocales from "#build/nuxvel/zod-locales";

/**
 * Gives the Zod messages in the browser the language of the current i18n
 * locale, so a form that validates with a schema shows its messages in the
 * language of the page. The module adds it only when a locale of the app
 * has a Zod locale other than English.
 */
export default defineNuxtPlugin({
  name: "nuxvel:zod-locale",
  setup(nuxtApp) {
    const errorMaps = Object.fromEntries(Object.entries(zodLocales).map(([code, locale]) => [code, locale?.().localeError]));
    const english = z.locales.en().localeError;

    z.config({ localeError: (issue) => (errorMaps[nuxtApp.$getLocale?.() ?? ""] ?? english)(issue) });
  },
});
