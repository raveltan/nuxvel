import { defineRateLimit } from "@nuxvel/nuxt/server/security";

export const loginRateLimit = defineRateLimit({ points: 4, window: { minutes: 1 } });
