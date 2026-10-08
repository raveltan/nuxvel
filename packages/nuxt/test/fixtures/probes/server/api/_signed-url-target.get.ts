import { requireSignature } from "@nuxvel/nuxt/server/security";

export default defineEventHandler((event) => {
  requireSignature(event);

  return getQuery(event);
});
