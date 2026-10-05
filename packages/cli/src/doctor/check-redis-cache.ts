import { appSettings } from "./app-settings.ts";
import { type DoctorCheck, passed, skipped, warning } from "./doctor-check.ts";

function instance(url: string | undefined) {
  try {
    return url ? new URL(url).host : undefined;
  } catch {
    return url;
  }
}

export const checkRedisCache: DoctorCheck = {
  name: "cache redis",
  async run({ cwd }) {
    const settings = await appSettings(cwd);

    if (settings.NODE_ENV !== "production") return [skipped("NODE_ENV is not production")];

    const cache = instance(settings.NUXT_REDIS_CACHE_URL);

    if (cache && cache !== instance(settings.NUXT_REDIS_URL)) return [passed(`the cache has its own Redis, ${cache}`)];

    return [
      warning(
        "the cache and the queue share one Redis instance",
        "Set NUXT_REDIS_CACHE_URL to a separate Redis, so evicted cache keys never take queued jobs with them",
      ),
    ];
  },
};
