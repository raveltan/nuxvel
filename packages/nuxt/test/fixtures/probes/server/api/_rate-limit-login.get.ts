export default defineEventHandler((event) => rateLimiter("login").consume(`ip:${clientIp(event) ?? "unknown"}`));
