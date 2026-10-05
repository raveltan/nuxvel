export default defineEventHandler((event) => rateLimiter($rateLimits._sharedProbe).consume(String(getQuery(event).key)));
