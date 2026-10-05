import { envHint } from "./env-hints";
import { envSchema } from "./env-schema";

/**
 * One problem {@link checkEnvironment} found with a variable.
 */
export interface EnvProblem {
  /** The variable's name, e.g. `NUXT_DATABASE_URL`. */
  variable: string;
  /** What is wrong, as the schema says it, e.g. `Required in production`. */
  problem: string;
  /** The line to show a person: `NUXT_DATABASE_URL is not set`, or `<variable>: <problem>`. */
  message: string;
  /** How to fix it, from {@link envHint}. */
  hint: string;
}

const RUNTIME_CONFIG_VARIABLES = {
  databaseUrl: "NUXT_DATABASE_URL",
  redisUrl: "NUXT_REDIS_URL",
  redisCacheUrl: "NUXT_REDIS_CACHE_URL",
  siteUrl: "NUXT_SITE_URL",
  mailUrl: "NUXT_MAIL_URL",
  storageUrl: "NUXT_STORAGE_URL",
  storageBucket: "NUXT_STORAGE_BUCKET",
  stripeSecretKey: "NUXT_STRIPE_SECRET_KEY",
};

/**
 * Merges the environment with the connection settings of `runtimeConfig` (`databaseUrl`,
 * `redisUrl`, `redisCacheUrl`, `siteUrl`, `mailUrl`, `storageUrl`, `storageBucket`, `stripeSecretKey`), under their `NUXT_*` names, the way
 * the server resolves them: a variable in `env` wins over `nuxt.config.ts`, and an empty
 * value counts as unset. Pass the result to {@link checkEnvironment}.
 *
 * @param runtimeConfig - the resolved `useRuntimeConfig()` in the server, or
 * `loadNuxtConfig()`'s `runtimeConfig` outside it.
 *
 * @example
 * import { loadNuxtConfig } from "@nuxt/kit";
 * import { environmentSettings } from "@nuxvel/nuxt/env";
 *
 * const { runtimeConfig } = await loadNuxtConfig({ cwd });
 * const settings = environmentSettings(process.env, runtimeConfig);
 */
export function environmentSettings(
  env: Record<string, string | undefined>,
  runtimeConfig: object,
): Record<string, string | undefined> {
  const fromConfig = Object.entries(RUNTIME_CONFIG_VARIABLES).flatMap(([key, variable]) => {
    const value: unknown = Reflect.get(runtimeConfig, key);
    return typeof value === "string" && value !== "" ? [[variable, value]] : [];
  });

  return { ...Object.fromEntries(fromConfig), ...env };
}

/**
 * Checks settings against {@link envSchema}, the check a nuxvel server runs at boot, and
 * returns one {@link EnvProblem} per invalid variable (none when it would boot). The server,
 * `nuxvel doctor` and every CLI command that runs inside the app use it, so they agree.
 * The checks that depend on the app's definitions (uploads in production) stay at
 * boot.
 *
 * @param settings - the variables by name, usually {@link environmentSettings}'s result.
 *
 * @example
 * import { checkEnvironment, environmentSettings } from "@nuxvel/nuxt/env";
 *
 * for (const { message, hint } of checkEnvironment(environmentSettings(process.env, runtimeConfig))) {
 *   console.error(`✖ ${message}\n  → ${hint}`);
 * }
 */
export function checkEnvironment(settings: Record<string, string | undefined>): EnvProblem[] {
  const result = envSchema.safeParse(settings);

  return (result.error?.issues ?? []).map((issue) => {
    const variable = issue.path.join(".");
    const unset = !settings[variable] && issue.code !== "custom";

    return {
      variable,
      problem: issue.message,
      message: unset ? `${variable} is not set` : `${variable}: ${issue.message}`,
      hint: envHint(variable),
    };
  });
}
