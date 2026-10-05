import type { ResolvedModuleOptions } from "@nuxt/schema";
import type { ModuleOptions } from "../module";

export const moduleDefaults = {
  ui: true,
  auth: { signInPath: "/", social: {}, blockDisposableEmails: false },
  rendering: {},
  api: { restPrefix: "/api/v1", docs: false, openapi: undefined },
} satisfies Partial<ModuleOptions>;

export type ResolvedOptions = ResolvedModuleOptions<ModuleOptions, typeof moduleDefaults>;

export type RuntimeFile = (path: string) => string;
