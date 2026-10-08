import { addRouteMiddleware, useNuxt } from "@nuxt/kit";
import type { ResolvedOptions, RuntimeFile } from "./resolved-options";

export function addAutoImports(options: ResolvedOptions, runtimeFile: RuntimeFile) {
  addRouteMiddleware([
    {
      name: "auth",
      path: runtimeFile("./runtime/app/middleware/auth"),
    },
    {
      name: "guest",
      path: runtimeFile("./runtime/app/middleware/guest"),
    },
  ]);

  const nuxt = useNuxt();
  // nuxt-og-image installs nothing without SSR, for example in a Storybook build, so defineOgImage does not exist
  if (options.seo?.ogImage && nuxt.options.ssr) {
    nuxt.options.alias["@nuxvel/nuxt/app/seo"] = runtimeFile("./runtime/app/seo/use-seo-og-image");
  }
}
