import { rateLimit } from "@nuxvel/nuxt/server/security";

export default defineEventHandler({
  onRequest: [
    rateLimit({
      points: 2,
      window: { minutes: 1 },
      by: ({ event }) => getHeader(event, "x-probe-key") ?? "none",
    }),
  ],
  handler: () => "ok",
});
