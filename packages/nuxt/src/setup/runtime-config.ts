import type { Nuxt } from "@nuxt/schema";
import { defu } from "defu";
import { socialProviderList } from "better-auth/social-providers";
import { DEFAULT_MAX_CONNECTIONS } from "../runtime/server/realtime/max-connections";
import type { I18nLocalesRuntimeConfig, NuxvelRuntimeConfig } from "../runtime/server/utils/nuxvel-runtime-config";
import type { AuthRuntimeConfig, SocialProviderId } from "../runtime/shared/auth/social-provider-id";
import { i18nOptions } from "./i18n-options";
import type { ResolvedOptions } from "./resolved-options";
import { isStorybookBuild } from "./storybook";
import { zodLocaleNames } from "./zod-locale";

export function applyRuntimeConfig(nuxt: Nuxt, options: ResolvedOptions) {
  const { unindexedForeignKeys: _unindexedForeignKeys, ...runtimeDatabase } = options.database ?? {};
  const runtimeOptions: NuxvelRuntimeConfig = {
    siteName: options.seo?.siteName,
    mail: options.mail,
    audit: options.audit,
    experiments: { requireConsent: options.experiments?.requireConsent ?? false },
    database: runtimeDatabase,
    queue: options.queue ?? {},
    realtime: { maxConnections: DEFAULT_MAX_CONNECTIONS, ...options.realtime },
    api: { restPrefix: options.api.restPrefix, openapi: options.api.openapi },
    security: { trustProxy: options.security?.trustProxy ?? false },
    health: { minFreeDiskPercent: options.health?.minFreeDiskPercent ?? 15 },
    billing: options.billing ?? false,
  };
  nuxt.options.runtimeConfig.nuxvel = defu(nuxt.options.runtimeConfig.nuxvel, runtimeOptions);
  const i18n = i18nOptions(nuxt);
  const enabledLocales = (i18n.locales ?? []).filter((locale) => !locale.disabled);
  const i18nLocales: I18nLocalesRuntimeConfig = {
    locales: enabledLocales.map((locale) => locale.code),
    zodLocales: zodLocaleNames(enabledLocales),
    defaultLocale: i18n.defaultLocale ?? "en",
    strategy: i18n.strategy ?? "prefix_except_default",
    localeCookie: i18n.localeCookie === undefined ? "user-locale" : (i18n.localeCookie ?? ""),
  };
  nuxt.options.runtimeConfig.i18nLocales ??= i18nLocales;
  nuxt.options.runtimeConfig.ogImageSecretRequired = !!options.seo?.ogImage && !isStorybookBuild(nuxt) && !nuxt.options.test;
  nuxt.options.runtimeConfig.databaseUrl ??= "";
  nuxt.options.runtimeConfig.databasePoolMax ??= 10;
  nuxt.options.runtimeConfig.redisUrl ??= "";
  nuxt.options.runtimeConfig.redisCacheUrl ??= "";
  nuxt.options.runtimeConfig.redisPrefix ??= "";
  nuxt.options.runtimeConfig.mailUrl ??= "";
  nuxt.options.runtimeConfig.storageUrl ??= "";
  nuxt.options.runtimeConfig.storageBucket ??= "";
  nuxt.options.runtimeConfig.storagePublicUrl ??= "";
  nuxt.options.runtimeConfig.erasureLogCommand ??= "";
  nuxt.options.runtimeConfig.siteUrl ??= "";
  nuxt.options.runtimeConfig.stripeSecretKey ??= "";
  nuxt.options.runtimeConfig.stripeTestKeysOnly ??= nuxt.options.dev || nuxt.options.test;
  nuxt.options.runtimeConfig.mailpitUrl ??= nuxt.options.dev ? "http://localhost:8025" : "";
  nuxt.options.runtimeConfig.public.sentryDsn ??= "";
  nuxt.options.runtimeConfig.public.pushVapidPublicKey ??= "";
  nuxt.options.runtimeConfig.pushVapidPrivateKey ??= "";
  nuxt.options.runtimeConfig.pushVapidSubject ??= "";
  nuxt.options.runtimeConfig.public.signInPath ??= options.auth.signInPath;
  nuxt.options.runtimeConfig.public.invalidateFallback ??= options.api.invalidateFallback;
  const social: Partial<Record<string, boolean>> = options.auth.social;
  const socialProviders = socialProviderList.filter(
    (id): id is SocialProviderId => social[id] === true && id !== "cognito" && id !== "tiktok",
  );
  nuxt.options.runtimeConfig.public.socialProviders ??= socialProviders;
  const authDefaults: AuthRuntimeConfig = {
    ...Object.fromEntries(socialProviders.map((id) => [id, { clientId: "", clientSecret: "" }])),
    requireEmailVerification: !nuxt.options.dev && !nuxt.options.test,
    checkBreachedPasswords: !nuxt.options.test,
    requireSocialCredentials: !nuxt.options.test,
    turnstileSecretKey: "",
    blockDisposableEmails: options.auth.blockDisposableEmails,
  };
  nuxt.options.runtimeConfig.auth = defu(nuxt.options.runtimeConfig.auth, authDefaults);

  return socialProviders;
}
