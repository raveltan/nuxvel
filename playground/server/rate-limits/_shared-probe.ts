import { defineRateLimit } from "@nuxvel/nuxt/server/security";

export default defineRateLimit({ points: 2, window: { minutes: 1 } });
