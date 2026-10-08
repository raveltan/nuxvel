import { useNuxvelConfig } from "@nuxvel/nuxt/server/observability";

export default defineEventHandler(() => {
  return useNuxvelConfig();
});
