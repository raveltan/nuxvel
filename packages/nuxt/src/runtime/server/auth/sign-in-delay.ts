import { createHash } from "node:crypto";
import { setTimeout as wait } from "node:timers/promises";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { useRedis } from "../redis/client";
import { redisKey } from "../redis/key";

const FREE_FAILURES = 5;
const MAX_DELAY_SECONDS = 30;
const FORGET_AFTER_SECONDS = 15 * 60;

function failuresKey(email: unknown) {
  if (typeof email !== "string") return undefined;

  return redisKey(`nuxvel:auth:failed-sign-ins:${createHash("sha256").update(email.toLowerCase()).digest("hex")}`);
}

function isPasswordSignIn(context: { path?: string }) {
  return context.path === "/sign-in/email";
}

export function signInDelay(): BetterAuthPlugin {
  return {
    id: "nuxvel-sign-in-delay",
    hooks: {
      before: [
        {
          matcher: isPasswordSignIn,
          handler: createAuthMiddleware(async (ctx) => {
            const key = failuresKey(ctx.body?.email);
            const failures = key ? Number(await useRedis("durable").get(key)) : 0;

            if (failures >= FREE_FAILURES) {
              await wait(Math.min(2 ** (failures - FREE_FAILURES), MAX_DELAY_SECONDS) * 1000);
            }
          }),
        },
      ],
      after: [
        {
          matcher: isPasswordSignIn,
          handler: createAuthMiddleware(async (ctx) => {
            const key = failuresKey(ctx.body?.email);
            const returned = ctx.context.returned;

            if (!key) return;

            if (!(returned instanceof APIError)) {
              await useRedis("durable").del(key);
            } else if (returned.statusCode === 401) {
              await useRedis("durable").multi().incr(key).expire(key, FORGET_AFTER_SECONDS).exec();
            }
          }),
        },
      ],
    },
  };
}
