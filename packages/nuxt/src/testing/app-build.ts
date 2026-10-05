export interface AppBuild {
  rootDir: string;
  buildDir: string;
  /** Whether the app sets `runtimeConfig.siteUrl` in its `nuxt.config.ts`. */
  siteUrlConfigured: boolean;
}

declare module "vitest" {
  interface ProvidedContext {
    nuxvelAppBuild: AppBuild;
  }
}
