import { z } from "zod";
import { LOG_FORMATS, LOG_LEVELS } from "./log-settings";

const unsetWhenEmpty = (value: unknown) => (value === "" ? undefined : value);

/**
 * The environment a nuxvel server checks at boot, before it accepts a request.
 *
 * The server refuses to start when `process.env` fails it, naming each
 * invalid variable; `nuxvel doctor` checks the shell environment and
 * `.env` against the same schema. Requires `NUXT_DATABASE_URL` and a
 * `NUXT_AUTH_SECRET` of at least 32 characters, and — when `NODE_ENV` is
 * `production`, where `useRedis()` has no `redis://localhost:6379`
 * fallback — `NUXT_REDIS_URL`, `NUXT_SITE_URL`, the public origin that
 * the auth links use, `NUXT_MAIL_URL`, the SMTP server of the auth mails, and a `NUXT_AUDIT_CHAIN_SECRET` of at least 32
 * characters, the key of the audit hash chain. `NUXT_LOG_LEVEL` (`silent`, `fatal`,
 * `error`, `warn`, `info`, `debug`, `trace`) and `NUXT_LOG_FORMAT`
 * (`pretty`, `json`) are optional, and must be one of those when set.
 *
 * @example
 * import { envSchema } from "@nuxvel/nuxt/env";
 *
 * const result = envSchema.safeParse(process.env);
 */
export const envSchema = z
  .object({
    NODE_ENV: z.string().optional(),
    NUXT_DATABASE_URL: z.string().min(1),
    NUXT_AUTH_SECRET: z.string().min(32),
    NUXT_REDIS_URL: z.string().optional(),
    NUXT_SITE_URL: z.string().optional(),
    NUXT_MAIL_URL: z.string().optional(),
    NUXT_AUDIT_CHAIN_SECRET: z.preprocess(unsetWhenEmpty, z.string().min(32).optional()),
    NUXT_LOG_LEVEL: z.preprocess(unsetWhenEmpty, z.enum(LOG_LEVELS).optional()),
    NUXT_LOG_FORMAT: z.preprocess(unsetWhenEmpty, z.enum(LOG_FORMATS).optional()),
  })
  .superRefine((env, context) => {
    for (const name of ["NUXT_REDIS_URL", "NUXT_SITE_URL", "NUXT_MAIL_URL", "NUXT_AUDIT_CHAIN_SECRET"] as const) {
      if (env.NODE_ENV === "production" && !env[name]) {
        context.addIssue({ code: "custom", path: [name], message: "Required in production" });
      }
    }
  });
