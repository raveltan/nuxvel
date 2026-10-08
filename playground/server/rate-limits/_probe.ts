import { defineRateLimit } from "@nuxvel/nuxt/server/security";

export default defineRateLimit({ points: 3, window: { seconds: 1 } });
