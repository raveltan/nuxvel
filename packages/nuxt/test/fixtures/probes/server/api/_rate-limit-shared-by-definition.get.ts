import sharedProbe from "~~/server/rate-limits/_shared-probe";
import { rateLimit } from "@nuxvel/nuxt/server/security";

export default defineEventHandler({
  onRequest: [rateLimit({ limit: sharedProbe, by: ({ event }) => getHeader(event, "x-probe-key") ?? "none" })],
  handler: () => "ok",
});
