import { NotFoundError, RateLimitedError } from "@nuxvel/nuxt/server/api";

export default defineEventHandler((event) => {
  if (getQuery(event).name === "RateLimitedError") {
    throw new RateLimitedError("handler too fast", { retryAfter: 7 });
  }

  throw new NotFoundError("handler found nothing");
});
