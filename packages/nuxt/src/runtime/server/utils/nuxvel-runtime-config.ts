/**
 * The runtime part of the `nuxvel` block, as {@link useNuxvelConfig}
 * returns it on the server. Build-time options (`rendering`, `ui`,
 * `auth`, `api.docs`) are left out; the sign-in path is `runtimeConfig.public.signInPath`.
 */
export interface NuxvelRuntimeConfig {
  /** `nuxvel.seo.siteName`, which `<MailLayout>` shows at the top of each mail. */
  siteName?: string;
  mail?: {
    /**
     * The address every {@link sendMail} message is sent from.
     *
     * @example
     * ```ts
     * nuxvel: { mail: { from: "App <hello@example.com>" } }
     * ```
     */
    from?: string;
  };
  audit?: {
    /**
     * Whole months of audit rows to keep, counting the current one. The
     * daily run of `.output/server/nuxvel/maintenance.mjs` drops older
     * monthly partitions; see {@link maintainAuditPartitions}. The build
     * bakes the value into that entry. `nuxvel db:migrate` and `nuxvel
     * dev` read it too and drop the same partitions. Unset keeps every
     * row forever.
     *
     * @example
     * ```ts
     * nuxvel: { audit: { retentionMonths: 24 } }
     * ```
     */
    retentionMonths?: number;
  };
  experiments?: {
    /**
     * Whether a visitor must consent before experiments count them. A
     * request without the `nuxvel-consent=granted` cookie gets the
     * control of every experiment and records no exposure, so it is
     * never tracked. Set the cookie when the visitor accepts. Off by
     * default; `NUXT_NUXVEL_EXPERIMENTS_REQUIRE_CONSENT` overrides it at
     * runtime.
     *
     * @example
     * ```ts
     * nuxvel: { experiments: { requireConsent: true } }
     * ```
     */
    requireConsent?: boolean;
  };
  database?: {
    /**
     * How long a soft-deleted row stays, as a Postgres interval such as
     * `"30 days"` or `"12 hours"`. When set, the daily
     * `nuxvel.purge-trashed` schedule deletes older trashed rows of every
     * table with `softDeletes()`; see {@link purgeTrashed}. Unset keeps
     * trashed rows until they are deleted by hand.
     *
     * @example
     * ```ts
     * nuxvel: { database: { purgeTrashedAfter: "30 days" } }
     * ```
     */
    purgeTrashedAfter?: string;
  };
  queue?: {
    /**
     * How long an `outbox` row stays after it reached the queue, as a
     * Postgres interval such as `"7 days"` (the default) or `"12 hours"`.
     * The daily `nuxvel.prune-outbox` schedule deletes older relayed
     * rows; see {@link pruneOutbox}.
     *
     * @example
     * ```ts
     * nuxvel: { queue: { outboxRetention: "30 days" } }
     * ```
     */
    outboxRetention?: string;
  };
  realtime?: {
    /**
     * How many realtime connections one signed-in user, or one IP
     * address for guests, can hold open on one server process. Past it,
     * `GET /api/channels` and `GET /api/channels/<name>` answer `429`
     * with a `Retry-After` header. Defaults to 20. Override it at
     * runtime with `NUXT_NUXVEL_REALTIME_MAX_CONNECTIONS`.
     *
     * @example
     * ```ts
     * nuxvel: { realtime: { maxConnections: 5 } }
     * ```
     */
    maxConnections?: number;
  };
  api?: {
    /**
     * Where the REST handler is mounted. Every procedure with
     * `.meta({ openapi: { method, path } })` answers at this prefix plus
     * its `path`. Read at build time: changing it at runtime does not
     * move the routes.
     *
     * @defaultValue `"/api/v1"`
     *
     * @example
     * ```ts
     * nuxvel: { api: { restPrefix: "/api/rest" } }
     * ```
     */
    restPrefix?: string;
    /**
     * Turns on the OpenAPI document at `<restPrefix>/openapi.json`, made
     * from every procedure with `openapi` meta, with this `title`,
     * `version` and optional `description`. Unset serves no document.
     *
     * @example
     * ```ts
     * nuxvel: { api: { openapi: { title: "Blog API", version: "1.0.0" } } }
     * ```
     */
    openapi?: { title: string; version: string; description?: string };
  };
  security?: {
    /**
     * Whether the app runs behind proxies that set `X-Forwarded-For`, and
     * how many. `true` trusts every proxy and takes the first address. A
     * number trusts that many proxies and takes the address that far from
     * the right. `"loopback"` trusts one proxy on the same machine, such as
     * Caddy on a VPS: it reads the header only on a request from 127.0.0.1
     * or ::1. Unset or `false` ignores the header, so a client cannot forge
     * its address. The `Forwarded` header is always ignored. {@link clientIp}
     * reads it. Set it at runtime with `NUXT_NUXVEL_SECURITY_TRUST_PROXY`.
     *
     * @defaultValue `false`
     *
     * @example
     * ```ts
     * nuxvel: { security: { trustProxy: 1 } }
     * ```
     */
    trustProxy?: boolean | number | "loopback";
  };
  health?: {
    /**
     * The free disk space, in percent, under which `/api/health/ready`
     * reports `disk: "low"` and `status: "degraded"`. It still answers
     * `200`, so traffic continues. It measures the disk of the server's
     * working directory. Set it at runtime with
     * `NUXT_NUXVEL_HEALTH_MIN_FREE_DISK_PERCENT`.
     *
     * @defaultValue `15`
     *
     * @example
     * ```ts
     * nuxvel: { health: { minFreeDiskPercent: 10 } }
     * ```
     */
    minFreeDiskPercent?: number;
  };
  /**
   * Turns on billing with Stripe: {@link useStripe} and the other billing
   * helpers on the server. The app installs `stripe` itself. It needs
   * `NUXT_STRIPE_SECRET_KEY` and `NUXT_STRIPE_WEBHOOK_SECRET`, which a
   * production server refuses to start without. A server outside
   * production refuses a live key (`sk_live_` or `rk_live_`), so a
   * development machine or a test never takes a real payment.
   *
   * @defaultValue `false`
   *
   * @example
   * ```ts
   * nuxvel: { billing: true }
   * ```
   */
  billing?: boolean;
}

/**
 * The locales of the `i18n` key that the server reads at runtime:
 * `runtimeConfig.i18nLocales`. `localeCookie` is `""` when the app turns
 * the locale cookie off. `zodLocales` maps each locale code to the name
 * of its built-in Zod locale, for example `zh` to `zhCN`. `strategy` is
 * the route prefix strategy of the `i18n` key.
 */
export interface I18nLocalesRuntimeConfig {
  locales: string[];
  zodLocales: Record<string, string>;
  defaultLocale: string;
  strategy: string;
  localeCookie: string;
}
