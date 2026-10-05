import uploads from "#nuxvel/uploads";
import { defineNitroPlugin, useRuntimeConfig } from "nitropack/runtime";
import { allowConnectToOrigin } from "../error-tracking/csp";

export default defineNitroPlugin((nitro) => {
  const { storageUrl, storagePublicUrl } = useRuntimeConfig();
  const url = storagePublicUrl || storageUrl;

  if (uploads.length === 0 || !URL.canParse(url)) return;

  const origin = new URL(url).origin;

  nitro.hooks.hook("nuxt-security:routeRules", (routeRules) => {
    allowConnectToOrigin(routeRules, origin);
  });
});
