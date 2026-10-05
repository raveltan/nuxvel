import { addServerTemplate, addTypeTemplate } from "@nuxt/kit";
import type { Nuxt } from "@nuxt/schema";
import vue from "unplugin-vue/rollup";
import { buildErrorHandlersModuleCode, buildErrorHandlersTypes } from "../error-handlers";
import type { RuntimeFile } from "./resolved-options";

export function configureNitro(nuxt: Nuxt, runtimeFile: RuntimeFile) {
  let appErrorHandlers: string[] = [];
  nuxt.hook("nitro:config", (config) => {
    config.rollupConfig ??= {};
    // mail templates are .vue files rendered on the server, which nitro's rollup cannot compile alone
    config.rollupConfig.plugins = [vue({ ssr: true }), ...[config.rollupConfig.plugins ?? []].flat()];
    config.externals ??= {};
    // trpc-nuxt/server imports from #imports, which only resolves inside the nitro bundle
    config.externals.inline = [...(config.externals.inline ?? []), "trpc-nuxt"];
    appErrorHandlers = [config.errorHandler ?? []].flat().filter((path) => path !== undefined);
    config.errorHandler = runtimeFile("./runtime/server/errors/route-error-handler");
    // nuxt-security fires its routeRules hook once, from a plugin at boot, so the CSP listener must be registered first
    config.plugins = [
      runtimeFile("./runtime/server/plugins/error-tracking-csp"),
      runtimeFile("./runtime/server/plugins/storage-csp"),
      ...(config.plugins ?? []),
    ];
  });
  addServerTemplate({
    filename: "#nuxvel/error-handlers",
    getContents: () => buildErrorHandlersModuleCode(appErrorHandlers),
  });
  addTypeTemplate(
    { filename: "types/nuxvel-error-handlers.d.ts", getContents: buildErrorHandlersTypes },
    { nitro: true },
  );
  addTypeTemplate(
    {
      filename: "types/nuxvel-mail-components.d.ts",
      getContents: () => `import type { mailComponents } from ${JSON.stringify(runtimeFile("./runtime/server/mail/mail-components"))};

import type { Translate } from ${JSON.stringify(runtimeFile("./runtime/server/i18n/translator"))};

type MailComponents = typeof mailComponents;

declare module "vue" {
  interface GlobalComponents extends MailComponents {}
  interface ComponentCustomProperties {
    $t: Translate;
  }
}
`,
    },
    { nitro: true },
  );
}
