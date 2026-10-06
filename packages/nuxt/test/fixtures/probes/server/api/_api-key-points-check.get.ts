export default defineEventHandler(async (event) => ({
  left: (await rateLimiter("api-key").consume(`api-key:${String(getQuery(event).id)}`)).remaining,
}));
