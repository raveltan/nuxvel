import { z } from "zod";
import sharedProbe from "~~/server/rate-limits/_shared-probe";

type IsAny<T> = 0 extends 1 & T ? true : false;

export const limitNameIsTyped: IsAny<RateLimitName> extends true
  ? never
  : [RateLimitName] extends ["login" | "channel-join" | "api-key" | "_probe" | "_shared-probe"]
    ? ["login" | "channel-join" | "api-key" | "_probe" | "_shared-probe"] extends [RateLimitName]
      ? true
      : never
    : never = true;

// @ts-expect-error the type is RateLimitName, like JobName or FlagName
export type OldLimiterName = RateLimiterName;

export async function consumesOnlyDeclaredLimiters() {
  await rateLimiter("_probe").consume("key");
  await rateLimiter("login").consume("key");

  // @ts-expect-error no file under server/rate-limits/ is named export
  await rateLimiter("export").consume("key");
  // @ts-expect-error limits are named after their files, so the old config name is gone
  await rateLimiter("probe").consume("key");
}

export async function consumesALimiterByItsDefinition() {
  await rateLimiter($rateLimits._sharedProbe).consume("key");
  await rateLimiter(sharedProbe).consume("key");

  // @ts-expect-error a backfill is not a rate limit
  rateLimiter($backfills._probeNames);
}

export const definedLimitIsNamed: IsAny<typeof sharedProbe> extends true
  ? never
  : typeof sharedProbe extends RateLimit
    ? true
    : never = true;

export function reusesSharedLimits() {
  // @ts-expect-error a shared limit takes points and a window
  defineRateLimit({ points: 1 });

  return {
    byName: rateLimit({ limit: "_shared-probe", by: "ip" }),
    byDefinition: rateLimit({ limit: sharedProbe, by: ({ event }) => event.path }),
    signedIn: authedProcedure.use(rateLimit({ limit: "login", by: "user" })).query(() => "ok"),
    // @ts-expect-error by "user" needs a user in ctx, shared limit or not
    anonymous: publicProcedure.use(rateLimit({ limit: "_shared-probe", by: "user" })).query(() => "ok"),
    // @ts-expect-error no file under server/rate-limits/ is named export
    unknown: rateLimit({ limit: "export", by: "ip" }),
    // @ts-expect-error a shared limit takes one options object, { limit, by }, like an action's
    positional: rateLimit("_shared-probe", { by: "ip" }),
    action: defineAction({
      input: z.object({ email: z.string() }),
      rateLimit: { limit: sharedProbe, by: ({ input }) => input.email },
      handler: ({ email }) => email,
    }),
  };
}

export const pointOfUseLimitIsTyped: IsAny<ReturnType<typeof rateLimit>> extends true ? never : true = true;

export function limitsAtThePointOfUse() {
  const perUser = rateLimit({ points: 1, window: { minutes: 1 }, by: "user" });
  const perIp = rateLimit({ points: 1, window: { hours: 1, minutes: 30 }, by: "ip" });

  // @ts-expect-error a window needs at least one unit
  rateLimit({ points: 1, window: {}, by: "ip" });
  // @ts-expect-error a window takes seconds, minutes, hours and days only
  rateLimit({ points: 1, window: { weeks: 1 }, by: "ip" });
  // @ts-expect-error by is "ip", "user" or a key function
  rateLimit({ points: 1, window: { minutes: 1 }, by: "email" });

  return {
    handler: defineEventHandler({ onRequest: [perIp, perUser], handler: () => "ok" }),
    signedIn: authedProcedure.use(perUser).query(() => "ok"),
    anyone: publicProcedure.use(perIp).query(() => "ok"),
    // @ts-expect-error by "user" needs a user in ctx, which a public procedure never has
    anonymous: publicProcedure.use(perUser).query(() => "ok"),
  };
}

export function limitsAnAction() {
  defineAction({
    input: z.object({ email: z.string() }),
    rateLimit: { points: 3, window: { minutes: 10 }, by: ({ input, actor }) => `${input.email}:${actor.id}` },
    handler: ({ email }) => email,
  });

  defineAction({
    input: z.object({ email: z.string() }),
    // @ts-expect-error the key function reads the action's parsed input
    rateLimit: { points: 3, window: { minutes: 10 }, by: ({ input }) => input.phone },
    handler: ({ email }) => email,
  });
}

type NamespacedRateLimit = typeof $rateLimits.login;

export const rateLimitsNamespaceIsTyped: IsAny<NamespacedRateLimit> extends true
  ? never
  : NamespacedRateLimit extends RateLimit
    ? true
    : never = true;
