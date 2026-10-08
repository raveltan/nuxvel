import { rateLimit } from "@nuxvel/nuxt/server/security";

export default defineEventHandler({
  onRequest: [rateLimit({ limit: "_shared-probe", by: ({ event }) => getHeader(event, "x-probe-key") ?? "none" })],
  handler: () => "ok",
});
