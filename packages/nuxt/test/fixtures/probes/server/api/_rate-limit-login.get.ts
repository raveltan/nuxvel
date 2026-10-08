import { clientIp, rateLimiter } from "@nuxvel/nuxt/server/security";

export default defineEventHandler((event) => rateLimiter("login").consume(`ip:${clientIp(event) ?? "unknown"}`));
