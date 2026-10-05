// https://nuxt.com/docs/api/configuration/nuxt-config
import { defineNuxtModule } from 'nuxt/kit'

const testProbesOnly = defineNuxtModule({
  meta: { name: 'playground-test-probes' },
  setup(_options, nuxt) {
    // types still include the probes so the _*-type-check files compile; the CLI tests' server builds need them too
    if (nuxt.options.test || nuxt.options._prepare || process.env.PLAYGROUND_TEST_PROBES) return
    nuxt.options.ignore.push('app/**/_*', 'server/**/_*')
  }
})

function storageOrigin() {
  return new URL(process.env.NUXT_STORAGE_URL ?? 'http://localhost:8333').origin
}

export default defineNuxtConfig({
  extends: process.env.PLAYGROUND_PROBES_LAYER ? ['../packages/nuxt/test/fixtures/probes'] : [],
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true, telemetry: false },
  modules: [testProbesOnly, '@nuxvel/nuxt'],
  security: {
    headers: {
      contentSecurityPolicy: {
        'connect-src': ["'self'", storageOrigin()],
        'img-src': ["'self'", 'data:', storageOrigin()]
      }
    }
  },
  app: { head: { htmlAttrs: { lang: 'en' }, title: 'nuxvel' } },
  i18n: {
    locales: [
      { code: 'en', iso: 'en-US' },
      { code: 'zh', iso: 'zh-CN' }
    ]
  },
  nuxvel: {
    mail: { from: 'nuxvel playground <hello@nuxvel.test>' },
    audit: { retentionMonths: 24 },
    realtime: { maxConnections: 20 },
    auth: { signInPath: '/sign-in', blockDisposableEmails: true },
    api: { openapi: { title: 'nuxvel playground', version: '1.0.0' }, docs: true },
    pwa: { name: 'nuxvel playground', shortName: 'playground', themeColor: '#0f172a' },
    billing: true
  }
})
