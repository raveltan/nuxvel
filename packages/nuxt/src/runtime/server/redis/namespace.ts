export const redisNamespace = process.env.VITEST ? `nuxvel:test${process.env.VITEST_POOL_ID ?? "1"}:` : "nuxvel:";
