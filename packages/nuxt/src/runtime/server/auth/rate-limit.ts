import type { BetterAuthRateLimitOptions } from "better-auth";
import { useEvent } from "nitropack/runtime";
import { RateLimitedError, TransientError } from "../errors/taxonomy";
import { useLogger } from "../logging/logger";
import { consumeLimit } from "../security/consume-limit";
import { ipKey } from "../security/rate-limit-key";
import { LOGIN_RATE_LIMIT, sharedLimit } from "../security/rate-limit-registry";
import { consumeAttempt } from "../security/sliding-window";

export const CLIENT_IP_HEADER = "x-nuxvel-client-ip";

function authPath(key: string) {
  return key.slice(key.indexOf("|") + 1);
}

async function signInAttempt() {
  const { name, points, seconds } = sharedLimit(LOGIN_RATE_LIMIT);

  try {
    await consumeLimit(`${name}:${ipKey(useEvent())}`, points, seconds);

    return { allowed: true, retryAfter: null };
  } catch (error) {
    if (!(error instanceof RateLimitedError)) throw error;

    return { allowed: false, retryAfter: error.retryAfter ?? seconds };
  }
}

async function attempt(key: string, rule: { max: number; window: number }) {
  if (authPath(key).startsWith("/sign-in/")) return signInAttempt();

  const result = await consumeAttempt(`auth:${key}`, rule.max, rule.window);

  return result.allowed ? { allowed: true, retryAfter: null } : { allowed: false, retryAfter: result.retryAfter };
}

export function authRateLimit(): BetterAuthRateLimitOptions {
  return {
    enabled: true,
    customRules: {
      "/get-session": false,
      "/send-verification-email": { window: 60 * 60, max: 3 },
      "/sign-up/*": () => {
        const { points, seconds } = sharedLimit(LOGIN_RATE_LIMIT);

        return { window: seconds, max: points };
      },
    },
    customStorage: {
      async consume(key, rule) {
        try {
          return await attempt(key, rule);
        } catch (error) {
          useLogger("auth").warn(`${authPath(key)} refused: its rate limit could not be checked`, error);

          throw new TransientError("Authentication is unavailable right now, try again in a moment");
        }
      },
    },
  };
}
