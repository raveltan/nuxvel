import { addPlugin, addServerPlugin, createResolver, defineNuxtModule } from "@nuxt/kit";
import type { ModuleDependencies, Nuxt } from "@nuxt/schema";
import { i18nOptions } from "./setup/i18n-options";
import { relative } from "node:path";
import { defu } from "defu";
import { addReleaseEntries } from "./release-entries";
import { nuxvelLocalesDir, writeNuxvelLocales } from "./setup/nuxvel-locales";
import { securityDefaults } from "./security-defaults";
import { type SeoOptions, siteConfig, siteHead } from "./seo";
import { type PwaIcon, type PwaOptions, vitePwaOptions } from "./pwa";
import type { RenderingPreset } from "./rendering";
import type { I18nLocalesRuntimeConfig, NuxvelRuntimeConfig } from "./runtime/server/utils/nuxvel-runtime-config";
import type { AuthRuntimeConfig, SocialProviderId } from "./runtime/shared/auth/social-provider-id";
import { moduleDefaults } from "./setup/resolved-options";
import { applyRouteRules } from "./setup/route-rules";
import { trackNitroScan } from "./setup/nitro-scan";
import { setupPwa } from "./setup/pwa";
import { dropFontsPluginInStorybook, includeStorybookTypes, localizeStorybook, prebundleSanitizeHtmlInStorybook, isStorybookBuild, storybookI18nOverrides } from "./setup/storybook";
import { addAutoImports, addSharedSchemaImports } from "./setup/auto-imports";
import { addComponents } from "./setup/components";
import { setupMaintenance } from "./setup/maintenance";
import { createDiscovery } from "./setup/discovery";
import { applyRuntimeConfig } from "./setup/runtime-config";
import { warnServerlessPreset } from "./setup/serverless-warning";
import { generatedModules } from "./setup/generated-modules";
import { registerNamespaces } from "./setup/namespaces";
import { addRouteTypes } from "./setup/route-types";
import { registerServerOnlyModules } from "./setup/server-only-modules";
import { reloadOnDefinitionChanges } from "./setup/dev-reload";
import { allowUiThemeStyle } from "./setup/ui-theme-csp";
import { configureNitro } from "./setup/nitro-config";
import { addServerPlugins } from "./setup/server-plugins";
import { addTestRoutes } from "./setup/test-routes";
import { addApiRoutes, addHealthRoutes } from "./setup/api-routes";
import { setupDevtools } from "./setup/devtools";
import { setupRequestSize } from "./setup/request-size";
import { addAppPlugins } from "./setup/app-plugins";

export type { NuxvelRuntimeConfig, PwaIcon, PwaOptions, RenderingPreset, SeoOptions, SocialProviderId };

const resolver = createResolver(import.meta.url);
const nuxvelLocalesSource = resolver.resolve("./runtime/locales");

/** The `nuxvel` block of `nuxt.config.ts`. */
export interface ModuleOptions extends NuxvelRuntimeConfig {
  /**
   * The database options: `purgeTrashedAfter` reaches the runtime config,
   * and `unindexedForeignKeys` only `nuxvel db:check`.
   */
  database?: NuxvelRuntimeConfig["database"] & {
    /**
     * The foreign keys that `nuxvel db:check` accepts without an index,
     * each with the reason. A key is `"<table>.<column>"`, with the
     * columns joined by commas for a key on more than one column. An
     * empty reason does not count. Only the CLI reads it; it is not in
     * the runtime config.
     *
     * @example
     * ```ts
     * nuxvel: {
     *   database: {
     *     unindexedForeignKeys: { "posts.editor_id": "Few posts have an editor, and editors are never deleted" },
     *   },
     * }
     * ```
     */
    unindexedForeignKeys?: Record<string, string>;
  };
  /**
   * A {@link RenderingPreset} per route pattern, applied on top of
   * `routeRules`. An explicit `routeRules` entry for the same pattern wins.
   *
   * @example
   * ```ts
   * nuxvel: {
   *   rendering: {
   *     "/blog/**": "cached",
   *     "/dashboard/**": "private",
   *     "/editor": "client",
   *   },
   * }
   * ```
   */
  rendering?: Record<string, RenderingPreset>;
  /**
   * Installs Nuxt UI as the app's component library. `false` leaves it out,
   * for apps that bring their own markup. When the app's `nuxt.config` sets
   * no `css` (and no module before nuxvel adds one), the module adds a Tailwind CSS entry with Nuxt UI and the
   * contrast overrides. When it sets `css`, the app owns the entry and
   * imports `tailwindcss`, `@nuxt/ui` and `@nuxvel/nuxt/ui.css` itself, so
   * Tailwind loads once.
   * With Nuxt UI on, icons default to inline SVG (`icon.mode: "svg"`) and
   * load only from the app's own server (`icon.fallbackToApi: false`), and
   * in production the CSP `style-src-attr` allows only the seven fixed
   * inline styles that Nuxt UI renders on the server, unless the app sets
   * its own `style-src-attr`.
   *
   * @defaultValue `true`
   *
   * @example
   * ```ts
   * nuxvel: { ui: false }
   * ```
   */
  ui?: boolean;
  /** The performance budgets that the build checks. */
  perf?: {
    /** The budget of the JavaScript and CSS that each page loads. */
    bundle?: {
      /**
       * The most initial JavaScript and CSS, in gzipped KB, one page may
       * load: the app entry, the page's chunk and their static imports.
       * `nuxvel build:manifest`, which the Docker build runs after
       * `nuxt build`, prints the size of each page and fails the build
       * when one is over. Without it, nothing is measured.
       *
       * @example
       * ```ts
       * nuxvel: { perf: { bundle: { maxInitialKb: 200 } } }
       * ```
       */
      maxInitialKb?: number;
    };
  };
  /**
   * Turns on site-wide SEO: a `<title>` template that ends with the site
   * name, a canonical link, default Open Graph and Twitter tags,
   * `robots.txt` and `sitemap.xml`. It installs `@nuxtjs/robots` and
   * `@nuxtjs/sitemap`. Pages behind the `auth` middleware and `private`
   * routes stay out of the sitemap and are `noindex`. Without this block,
   * nuxvel adds none of it. See {@link SeoOptions}.
   *
   * @example
   * ```ts
   * nuxvel: {
   *   seo: {
   *     siteName: "The Blog",
   *     siteUrl: "https://blog.example.com",
   *     defaultDescription: "Notes on building web apps.",
   *   },
   * }
   * ```
   */
  seo?: SeoOptions;
  /**
   * Makes the app an installable Progressive Web App through
   * `@vite-pwa/nuxt`: a web app manifest at `/manifest.webmanifest` and,
   * in a production build, a service worker. The worker precaches the
   * app shell and serves `/offline` for a page it cannot load. It never
   * stores an `/api/**` response, which nuxvel sends with
   * `Cache-Control: private, no-store`, or a page whose `Cache-Control`
   * says `private` or `no-store`, and `useUser().signOut()` deletes its
   * page cache. Every page rendered for a request with a session
   * cookie has `Cache-Control: private, no-store`. The app's own
   * `pages/offline.vue` replaces nuxvel's default offline page. It also
   * turns on web push: `usePush()` in the app, {@link sendPush} and the
   * `/api/push/subscribe` routes on the server, and a service worker
   * that shows each notification. With `ui` on, `<PwaInstallPrompt>`
   * and `<PushToggle>` are registered. A `pwa` key in
   * `nuxt.config.ts` still overrides any `@vite-pwa/nuxt` option.
   *
   * @example
   * ```ts
   * nuxvel: {
   *   pwa: {
   *     name: "Acme Blog",
   *     shortName: "Blog",
   *     themeColor: "#0f172a",
   *     icons: [
   *       { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
   *       { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
   *     ],
   *   },
   * }
   * ```
   */
  pwa?: PwaOptions;
  /**
   * The email and password auth of Better Auth: where the `auth`
   * middleware sends a signed-out visitor, the social providers and the
   * disposable email check.
   */
  auth?: {
    /**
     * Where the `auth` route middleware sends a signed-out visitor.
     *
     * @defaultValue `"/"`
     *
     * @example
     * ```ts
     * nuxvel: { auth: { signInPath: "/sign-in" } }
     * ```
     */
    signInPath?: string;
    /**
     * The social providers users can sign in with, by Better Auth
     * provider name. Each one reads its OAuth app from
     * `NUXT_AUTH_<PROVIDER>_CLIENT_ID` and
     * `NUXT_AUTH_<PROVIDER>_CLIENT_SECRET`, which a production server
     * refuses to start without. The provider sends the user back to
     * `/api/auth/callback/<provider>`.
     *
     * @example
     * ```ts
     * nuxvel: { auth: { social: { github: true, google: true } } }
     * ```
     */
    social?: Partial<Record<SocialProviderId, true>>;
    /**
     * Refuses sign-up and email change with an address from a
     * disposable email service, such as `mailinator.com`. The domains
     * come from the `disposable-email-domains-js` list. The refusal is
     * HTTP 400 with the code `DISPOSABLE_EMAIL`.
     *
     * @defaultValue `false`
     *
     * @example
     * ```ts
     * nuxvel: { auth: { blockDisposableEmails: true } }
     * ```
     */
    blockDisposableEmails?: boolean;
  };
  /**
   * The REST side of the tRPC API: the prefix of the REST handler, the
   * OpenAPI document and its Scalar reference page.
   */
  api?: NonNullable<NuxvelRuntimeConfig["api"]> & {
    /**
     * Serves the Scalar API reference for the OpenAPI document at
     * `<restPrefix>/docs`. It is always on in development. Needs
     * `api.openapi`. The page loads Scalar from jsDelivr, and its own
     * CSP allows only that pinned script, inline styles and requests to
     * the app.
     *
     * @defaultValue `false`
     *
     * @example
     * ```ts
     * nuxvel: { api: { openapi: { title: "Blog API", version: "1.0.0" }, docs: true } }
     * ```
     */
    docs?: boolean;
  };
}

declare module "@nuxt/schema" {
  interface RuntimeConfig {
    /**
     * The runtime part of the `nuxvel` block of `nuxt.config.ts`, which
     * {@link useNuxvelConfig} returns on the server.
     */
    nuxvel: NuxvelRuntimeConfig;
    /**
     * The locale codes, the default locale and the locale cookie of the
     * `i18n` key, which {@link currentLocale} reads.
     */
    i18nLocales: I18nLocalesRuntimeConfig;
    /**
     * Postgres connection string {@link useDb} connects with. Set it with
     * `NUXT_DATABASE_URL`; the server refuses to start without one.
     */
    databaseUrl: string;
    /**
     * Most connections the {@link useDb} pool of one server process opens,
     * 10 by default. Set it with `NUXT_DATABASE_POOL_MAX`; `nuxvel deploy`
     * sizes it so every process on the server fits under the Postgres
     * connection limit.
     */
    databasePoolMax: number;
    /**
     * Redis connection string {@link useRedis} connects with. Set it with
     * `NUXT_REDIS_URL`; outside production it falls back to
     * `redis://localhost:6379`.
     */
    redisUrl: string;
    /**
     * Redis connection string for the `cache` purpose of {@link useRedis}:
     * cached values. Set it with
     * `NUXT_REDIS_CACHE_URL`; empty uses `redisUrl`.
     */
    redisCacheUrl: string;
    /**
     * Prefix of every Redis key and pub/sub channel of the app, see
     * {@link redisKey}. Set it with `NUXT_REDIS_PREFIX`; empty by default.
     */
    redisPrefix: string;
    /**
     * SMTP URL the `nuxvel.mail` job delivers through. Set it with
     * `NUXT_MAIL_URL`; required in production, where the auth mails need it.
     */
    mailUrl: string;
    /**
     * S3-compatible endpoint, access key and secret as its user and
     * password, for {@link useS3}. Set it with `NUXT_STORAGE_URL`.
     */
    storageUrl: string;
    /** Bucket {@link useBucket} names. Set it with `NUXT_STORAGE_BUCKET`. */
    storageBucket: string;
    /**
     * Public address of the storage, such as `https://files.example.com`,
     * that {@link signedReadUrl} and the upload URLs point browsers at,
     * signed with the keys of `NUXT_STORAGE_URL`, and that the server adds
     * to the CSP `connect-src` when the app has an upload. Set it with
     * `NUXT_STORAGE_PUBLIC_URL` when the server reaches the storage on an
     * address browsers cannot, like `http://127.0.0.1:8333` on a VPS.
     */
    storagePublicUrl: string;
    /**
     * Command that {@link eraseUserData} runs, with the user's ID as its
     * last argument, before it deletes anything, so the erasure is recorded
     * outside the database and a restore of an older backup can apply it
     * again. Split on spaces, run without a shell; when it fails, nothing
     * is erased. Set it with `NUXT_ERASURE_LOG_COMMAND`; `nuxvel deploy`
     * sets it on a VPS. Unset records nothing.
     */
    erasureLogCommand: string;
    /**
     * Public origin of the app, for example `https://app.example.com`.
     * Better Auth builds the links in its mails (verify, reset, change
     * email) from it and trusts it for `callbackURL` and `redirectTo`,
     * whatever `Host` header a request sends. Set it with
     * `NUXT_SITE_URL`; required in production. Empty uses the origin
     * of the request, outside production only.
     */
    siteUrl: string;
    /**
     * Mailpit's web address, which the DevTools tab's mail panel reads
     * sent dev mail from and links to. Dev server only; set it with
     * `NUXT_MAILPIT_URL`, defaulting to `http://localhost:8025`.
     */
    mailpitUrl: string;
    /**
     * The Stripe secret key that {@link useStripe} calls Stripe with. Set
     * it with `NUXT_STRIPE_SECRET_KEY`; with `nuxvel.billing` on, a
     * production server refuses to start without it.
     */
    stripeSecretKey: string;
    /**
     * Whether the server refuses a live Stripe key whatever `NODE_ENV`
     * says: `true` in `nuxt dev` and in a test build, `false` in a
     * production build.
     */
    stripeTestKeysOnly: boolean;
    /**
     * The OAuth app of each provider in `nuxvel.auth.social`, set with
     * `NUXT_AUTH_<PROVIDER>_CLIENT_ID` and
     * `NUXT_AUTH_<PROVIDER>_CLIENT_SECRET`, and the auth checks that
     * differ between builds.
     */
    auth: AuthRuntimeConfig;
    /**
     * The VAPID private key that signs each web push {@link sendPush}
     * sends. Set it with `NUXT_PUSH_VAPID_PRIVATE_KEY`; `nuxvel push:keys`
     * writes one.
     */
    pushVapidPrivateKey: string;
    /**
     * The `mailto:` or `https:` contact that push services reach the app's
     * operator at. Set it with `NUXT_PUSH_VAPID_SUBJECT`.
     */
    pushVapidSubject: string;
  }
  interface PublicRuntimeConfig {
    /**
     * The VAPID public key that `usePush()` subscribes with and
     * {@link sendPush} signs with. Set it with
     * `NUXT_PUBLIC_PUSH_VAPID_PUBLIC_KEY`; `nuxvel push:keys` writes one.
     */
    pushVapidPublicKey: string;
    /**
     * DSN of the Sentry-compatible error tracker (Bugsink, Sentry,
     * GlitchTip) that the server, the browser and `nuxvel queue:work`
     * report unexpected errors to. Empty turns error tracking off. Set
     * it with `NUXT_PUBLIC_SENTRY_DSN`.
     */
    sentryDsn: string;
    /**
     * Where the `auth` route middleware sends a signed-out visitor, from
     * `nuxvel.auth.signInPath`.
     */
    signInPath: string;
    /** The providers `nuxvel.auth.social` turns on, which `<SocialSignIn>` shows. */
    socialProviders: SocialProviderId[];
  }
}

// @nuxt/devtools-kit loads nuxt/schema, whose bridged NuxtOptions ignores @nuxt/schema-only augments
declare module "nuxt/schema" {
  interface RuntimeConfig {
    nuxvel: NuxvelRuntimeConfig;
    databaseUrl: string;
    databasePoolMax: number;
    redisUrl: string;
    redisCacheUrl: string;
    redisPrefix: string;
    mailUrl: string;
    storageUrl: string;
    storageBucket: string;
    storagePublicUrl: string;
    erasureLogCommand: string;
    siteUrl: string;
    mailpitUrl: string;
    stripeSecretKey: string;
    stripeTestKeysOnly: boolean;
    auth: AuthRuntimeConfig;
    pushVapidPrivateKey: string;
    pushVapidSubject: string;
    i18nLocales: I18nLocalesRuntimeConfig;
  }
  interface PublicRuntimeConfig {
    pushVapidPublicKey: string;
    sentryDsn: string;
    signInPath: string;
    socialProviders: SocialProviderId[];
  }
}

function hasLocalizedSeo(nuxt: Nuxt) {
  // the nuxvel key reaches NuxtOptions only in the app's generated types, which a module never sees
  const { nuxvel } = nuxt.options as { nuxvel?: ModuleOptions };
  return Boolean(nuxvel?.seo) && (i18nOptions(nuxt).locales?.length ?? 0) > 1;
}

/**
 * The nuxvel Nuxt module.
 *
 * Add it to `modules` in `nuxt.config.ts` and configure it under the
 * `nuxvel` key, which is merged into runtime config and read back with
 * {@link useNuxvelConfig}.
 *
 * It registers the server auto-imports (database, errors, redis, rate limiting, jobs, events, backfills, flags,
 * tRPC, actions, policies, mail, notifications, storage, webhooks, realtime, utils), the `auth` and `guest` route middleware,
 * the app composables and `authClient`, `isMaintenanceError()`, the `<QueryState>`, `<DateTime>` and `<Maintenance>` components, Pinia Colada, the `$trpc` client plugin, the flags and flash plugins, the `/api/trpc`, the REST handler at `api.restPrefix`, `/api/flags`, `/api/flags/exposures`, `/api/notifications`, `/api/notifications/read` and
 * `/api/auth` handlers, the `/api/uploads/<name>` presigned-URL endpoint, the
 * `/api/webhooks/<name>` webhook endpoint, the `/api/channels` multiplexed and
 * `/api/channels/<name>` single realtime endpoints (plus the built-in `flags` and `maintenance` channels and each user's `notifications:<userId>` channel) with their
 * `/api/channels/join`, `/api/channels/leave` and `/api/channels/presence` requests, and the `/api/health/live` and
 * `/api/health/ready` probes, installs Nuxt UI with its Tailwind CSS entry, the `toasted()` and `useConfirm()` helpers, the flash toasts and the `<SocialSignIn>`, `<UploadField>`, `<AuthForm>`, `<DataTable>`, `<SearchInput>`, `<PresenceAvatars>`, `<TypingIndicator>`, `<MaintenanceBanner>` and `<NotificationBell>` components
 * unless `ui` is `false`, installs `@vite-pwa/nuxt` with an offline page and web push when `pwa` is set, and reports unexpected server and browser errors
 * to the error tracker named by `NUXT_PUBLIC_SENTRY_DSN`. It also generates the `#nuxvel/*` modules by
 * discovering the app's `server/database/schema`, `server/database/backfills`, `server/flags`, `server/jobs`,
 * `server/events`, `server/listeners`, `server/schedules`, `server/rate-limits`, `server/errors`, `server/policies`, `server/mail`, `server/notifications`, `server/uploads`, `server/privacy`, `server/webhooks`, `server/channels`, `server/seeders` and `server/trpc/routers` files, so nothing is registered by hand, and
 * names each definition after its path under its folder (`server/jobs/post/notify.job.ts` is the job
 * `"post.notify"`), and loads them at server start.
 * A middleware after nuxt-security's request size limiter answers 411 to a request body sent without `Content-Length`,
 * and 413 to a `Content-Length` at or over the limit for every method, PATCH included.
 * A middleware that runs before the other module middleware answers 503 while the app is in maintenance mode
 * (`nuxvel down`), and an app without `error.vue` renders `<Maintenance>` for it.
 * A server started with `NUXVEL_ROLE=worker` also runs the queue worker, as `nuxvel queue:work` and
 * `nuxvel dev` do in development. A server started by pm2 sends it the `ready` message once it listens.
 * Each `rendering` preset becomes the matching `routeRules` entry, and a
 * page behind the `auth` middleware whose route rules would cache it is
 * forced onto the `private` preset with a build-time warning. With `seo`
 * set, it installs `@nuxtjs/robots` and `@nuxtjs/sitemap`, sets the
 * `<title>` template and default meta tags, and adds a canonical link to
 * each page. It installs `nuxt-i18n-micro` with one `en` locale, no route
 * prefix for the default locale, the `user-locale` cookie and the default
 * locale as the fallback for a key that a locale does not have. With `seo`
 * and two or more locales, the i18n meta gives each page `<html lang>`,
 * its canonical link and `hreflang` alternates, and the sitemap has one
 * sitemap for each locale. The app's `i18n` key overrides each of these. In
 * development only, it adds a live `nuxvel` Nuxt DevTools tab (requests, SQL,
 * jobs, schedules, events and listeners, mail, backfills, rate limits, flags
 * and experiments, audit entries, channels, policies and tRPC procedures)
 * served from `/_nuxvel/devtools/` and listed once DevTools is authorized,
 * mounts the Bull Board queue dashboard at `/_nuxvel/queue`, both
 * answering only requests from this machine, relaxes the
 * CSP's `style-src` to `'self' 'unsafe-inline'` so DevTools' web components
 * can style themselves, and sends neither `upgrade-insecure-requests` nor
 * HSTS, so plain-HTTP dev from a non-localhost host loads its assets.
 */
export default defineNuxtModule<ModuleOptions>().with({
  meta: {
    name: "@nuxvel/nuxt",
    configKey: "nuxvel",
  },
  defaults: moduleDefaults,
  moduleDependencies(nuxt): ModuleDependencies {
    // the nuxvel key reaches NuxtOptions only in the app's generated types, which a module never sees
    const { nuxvel } = nuxt.options as { nuxvel?: ModuleOptions };
    const i18n = i18nOptions(nuxt);
    const localizedSeo = hasLocalizedSeo(nuxt);
    return {
      "nuxt-i18n-micro": {
        defaults: {
          ...(i18n.locales?.length ? {} : { locales: [{ code: "en", iso: "en-US" }] }),
          localeCookie: "user-locale",
          fallbackLocale: i18n.defaultLocale ?? "en",
          meta: localizedSeo,
          disableWatcher: true,
          translationPayloads: { mode: "source" },
          // the library joins each entry to the root of each layer, so an absolute path does not work
          additionalTranslationDirs: [relative(nuxt.options.rootDir, writeNuxvelLocales(nuxt, nuxvelLocalesSource))],
        },
        ...storybookI18nOverrides(nuxt),
      },
      "nuxt-security": { defaults: securityDefaults(nuxt, nuxvel?.ui !== false) },
      "@pinia/nuxt": {},
      "@pinia/colada-nuxt": {},
      ...(nuxvel?.ui === false ? {} : { "@nuxt/ui": {}, "@nuxt/icon": { defaults: { mode: "svg", fallbackToApi: false } } }),
      ...(nuxvel?.seo
        ? {
            "nuxt-site-config": { defaults: siteConfig(nuxvel.seo) },
            "@nuxtjs/robots": {},
            "@nuxtjs/sitemap": localizedSeo ? {} : { defaults: { autoI18n: false } },
            ...(nuxvel.seo.ogImage && !isStorybookBuild(nuxt) ? { "nuxt-og-image": {} } : {}),
          }
        : {}),
      ...(nuxvel?.pwa ? { "@vite-pwa/nuxt": { defaults: vitePwaOptions(nuxvel.pwa, nuxt.options.buildId) } } : {}),
    };
  },
  async setup(options, nuxt) {
    const runtimeFile = resolver.resolve;
    applyRouteRules(nuxt, options);
    const nitroScan = trackNitroScan(nuxt);
    const appOwnsCss = nuxt.options.css.length > 0;
    if (options.ui && !appOwnsCss) nuxt.options.css.push(runtimeFile("./runtime/app/ui.css"));
    if (options.seo) {
      nuxt.options.app.head = defu(nuxt.options.app.head, siteHead(options.seo));
      addPlugin(runtimeFile("./runtime/app/seo/absolute-urls"));
      const localizedSeo = hasLocalizedSeo(nuxt);
      if (!(i18nOptions(nuxt).meta ?? localizedSeo)) addPlugin(runtimeFile("./runtime/app/seo/canonical"));
      if (localizedSeo) addServerPlugin(runtimeFile("./runtime/server/plugins/sitemap-locale-alternates"));
    }
    setupPwa(nuxt, options, runtimeFile);
    includeStorybookTypes(nuxt);
    dropFontsPluginInStorybook(nuxt);
    prebundleSanitizeHtmlInStorybook(nuxt);
    localizeStorybook(nuxt, nuxvelLocalesDir(nuxt));
    // useQuery's onServerPrefetch marks a useId boundary; stripped from the client, ids under a query mismatch on hydration
    const clientComposables = nuxt.options.optimization.treeShake.composables.client;
    if (clientComposables.vue) {
      clientComposables.vue = clientComposables.vue.filter((name) => name !== "onServerPrefetch");
    }
    nuxt.options.nitro.experimental = defu(
      { asyncContext: true },
      nuxt.options.nitro.experimental,
      { tasks: true },
    );
    nuxt.options.experimental.typedPages = true;

    addAutoImports(options, runtimeFile);
    addComponents(options, runtimeFile);
    setupMaintenance(nuxt, options, runtimeFile);
    setupRequestSize(nuxt, runtimeFile);

    const discovery = createDiscovery(nuxt);
    addSharedSchemaImports(nuxt, discovery.layerDirectories);
    const socialProviders = applyRuntimeConfig(nuxt, options);
    addReleaseEntries(nuxt, runtimeFile, options.audit?.retentionMonths);
    warnServerlessPreset(nuxt, discovery);

    const modules = generatedModules(options, discovery, nitroScan, socialProviders, runtimeFile);
    const { namespaces, namespaceModules } = await registerNamespaces(discovery);
    addRouteTypes(nitroScan, runtimeFile);
    registerServerOnlyModules(nuxt, { ...modules, ...namespaceModules });
    reloadOnDefinitionChanges(nuxt, discovery, namespaces);
    configureNitro(nuxt, runtimeFile);
    if (options.ui) allowUiThemeStyle(nuxt);

    addServerPlugins(nuxt, options, runtimeFile);
    addTestRoutes(nuxt, runtimeFile, options.billing ?? false);
    addHealthRoutes(runtimeFile);
    await setupDevtools(nuxt, runtimeFile);
    addApiRoutes(nuxt, options, runtimeFile);
    addAppPlugins(nuxt, runtimeFile);
  },
});
