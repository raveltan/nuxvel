import { defineNitroPlugin, useRuntimeConfig } from "nitropack/runtime";
import { allowConnectToOrigin, dsnOrigin } from "../error-tracking/csp";

export default defineNitroPlugin((nitro) => {
  const dsn = useRuntimeConfig().public.sentryDsn;

  if (!dsn) return;

  const origin = dsnOrigin(dsn);

  nitro.hooks.hook("nuxt-security:routeRules", (routeRules) => {
    allowConnectToOrigin(routeRules, origin);
  });
});
