import _sharedProbeRateLimit from "#server/rate-limits/_shared-probe";
import { rateLimiter } from "@nuxvel/nuxt/server/security";

export default defineEventHandler((event) => rateLimiter(_sharedProbeRateLimit).consume(String(getQuery(event).key)));
