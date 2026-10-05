import { useLogger } from "@nuxt/kit";
import type { Nuxt } from "@nuxt/schema";
import { scanServerRoutes } from "nitropack/core";
import { defu } from "defu";
import type { NuxtSecurityRouteRules } from "nuxt-security";
import { renderingRouteRules } from "../rendering";
import { guardPrivatePages } from "../private-page-guard";
import { reservedPathErrors } from "../reserved-paths";
import { hidePrivatePages } from "../seo";
import { TEST_CONTROL_PATH } from "../runtime/server/testing/control-path";
import { TRPC_PATH } from "../runtime/shared/trpc/trpc-path";
import type { ResolvedOptions } from "./resolved-options";

// provider payloads legitimately carry HTML; the signature is what vouches for them
const WEBHOOK_SECURITY: NuxtSecurityRouteRules = { xssValidator: false };
// each procedure input goes through its Zod schema, and richText() sanitizes the HTML it lets through
const PROCEDURE_SECURITY: NuxtSecurityRouteRules = { xssValidator: false };

export function applyRouteRules(nuxt: Nuxt, options: ResolvedOptions) {
  nuxt.options.routeRules ??= {};
  for (const [pattern, rule] of Object.entries(
    renderingRouteRules(options.rendering),
  )) {
    nuxt.options.routeRules[pattern] = defu(
      nuxt.options.routeRules[pattern],
      rule,
    );
  }
  let nitroRouteRules: Parameters<typeof guardPrivatePages>[1] | undefined;
  let resolvedPages: Parameters<typeof guardPrivatePages>[0] | undefined;
  const checkPrivatePages = () => {
    if (!nitroRouteRules || !resolvedPages) return;

    for (const pattern of guardPrivatePages(resolvedPages, nitroRouteRules)) {
      useLogger("nuxvel").warn(
        `${pattern} uses the auth middleware but its route rules cache it; rendering it with the private preset instead.`,
      );
    }
    if (options.seo) hidePrivatePages(resolvedPages, nitroRouteRules);
  };
  nuxt.hook("nitro:init", (nitro) => {
    nitroRouteRules = nitro.options.routeRules;
    checkPrivatePages();
  });
  // registered after every module's hook, so the pages include the localized copies nuxt-i18n-micro adds
  nuxt.hook("modules:done", () => {
    nuxt.hook("pages:resolved", (pages) => {
      resolvedPages = pages;
      checkPrivatePages();
    });
  });
  nuxt.hook("nitro:build:before", async (nitro) => {
    const routeFiles = await scanServerRoutes(nitro, nitro.options.routesDir || "routes");
    const [reservedPathError] = reservedPathErrors(resolvedPages ?? [], routeFiles);
    if (reservedPathError) throw new Error(reservedPathError);
  });
  nuxt.options.routeRules["/api/**"] = defu(nuxt.options.routeRules["/api/**"], {
    headers: { "cache-control": "private, no-store" },
  });
  nuxt.options.routeRules["/api/webhooks/**"] = {
    ...nuxt.options.routeRules["/api/webhooks/**"],
    security: WEBHOOK_SECURITY,
  };
  for (const pattern of [`${TRPC_PATH}/**`, `${options.api.restPrefix}/**`, ...(nuxt.options.test ? [`${TEST_CONTROL_PATH}/**`] : [])]) {
    nuxt.options.routeRules[pattern] = {
      ...nuxt.options.routeRules[pattern],
      security: { ...nuxt.options.routeRules[pattern]?.security, ...PROCEDURE_SECURITY },
    };
  }
}
