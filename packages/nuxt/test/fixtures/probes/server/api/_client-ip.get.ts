export default defineEventHandler((event) => ({ clientIp: clientIp(event) ?? null }));
