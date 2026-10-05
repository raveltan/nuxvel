import { setResponseHeaders } from "h3";
import { RateLimitedError } from "../errors/taxonomy";
import { publishObserved } from "../observe/channels";
import { consumeAttempt } from "./sliding-window";
import { currentEvent } from "../utils/current-event";

export async function consumeLimit(key: string, points: number, seconds: number) {
  const attempt = await consumeAttempt(key, points, seconds);
  const event = currentEvent();

  publishObserved("rate-limit:hit", { key, allowed: attempt.allowed });

  if (event && !event.node.res.headersSent) {
    setResponseHeaders(event, {
      "ratelimit-limit": String(points),
      "ratelimit-remaining": String(attempt.remaining),
      "ratelimit-reset": String(attempt.reset),
    });
  }

  if (!attempt.allowed) {
    throw new RateLimitedError(`Too many attempts, retry in ${attempt.retryAfter}s`, {
      retryAfter: attempt.retryAfter,
    });
  }

  return { remaining: attempt.remaining };
}
