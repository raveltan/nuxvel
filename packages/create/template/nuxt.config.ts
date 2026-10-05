export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true, telemetry: false },
  modules: ['@nuxvel/nuxt'],
  css: ['~/assets/css/main.css'],
  nuxvel: {
    // The address of every mail. sendMail() throws while it is not set.
    mail: { from: 'nuxvel <hello@example.com>' },
    auth: {
      signInPath: '/sign-in',
      // Each provider reads NUXT_AUTH_<PROVIDER>_CLIENT_ID and _CLIENT_SECRET from .env.
      // social: { github: true },
    },
    seo: { siteName: 'nuxvel', defaultDescription: 'A nuxvel app.', ogImage: true },
    pwa: {
      name: 'nuxvel',
      themeColor: '#b20d27',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    },
    // Serves /api/v1/openapi.json for procedures with .meta({ openapi }), and its reference page at /api/v1/docs.
    // docs: true also serves the reference page in production.
    // api: { restPrefix: '/api/v1', openapi: { title: 'nuxvel API', version: '1.0.0' }, docs: false },
    queue: { outboxRetention: '7 days' },
    // Deletes soft-deleted rows for good after this long.
    // database: { purgeTrashedAfter: '30 days' },
    // Keeps this many months of audit log rows. Unset keeps every row.
    // audit: { retentionMonths: 24 },
    // Read the client IP from X-Forwarded-For when the app runs behind this many proxies.
    // security: { trustProxy: 1 },
    // realtime: { maxConnections: 20 },
    // health: { minFreeDiskPercent: 15 },
    // rendering: { '/blog/**': 'cached', '/dashboard/**': 'private' },
    // Fails nuxvel build when a page loads more than this many gzipped KB of JavaScript and CSS.
    // perf: { bundle: { maxInitialKb: 200 } },
    // Serves the control of every experiment, and records nothing, until the visitor consents.
    // experiments: { requireConsent: true },
    // false leaves out Nuxt UI, for an app that brings its own components.
    // ui: true,
  },
  // To keep only English, remove zh here and delete locales/zh.json.
  i18n: {
    locales: [
      { code: 'en', iso: 'en-US', displayName: 'English' },
      { code: 'zh', iso: 'zh-CN', displayName: '中文' },
    ],
  },
  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    },
  },
})
