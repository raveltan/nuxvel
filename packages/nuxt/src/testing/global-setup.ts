/**
 * Vitest global setup that builds the app for tests, for
 * `@nuxvel/nuxt/testing/setup` to start in every test file. List it in `globalSetup`, after any
 * global setup that sets the environment the build reads.
 *
 * It keeps the build in `node_modules/.cache/nuxvel/test/<key>/build`
 * and uses it again while the app's inputs do not change. The inputs
 * include `app/` and `public/`, but not the test files. It keeps the two
 * newest builds, and does not remove a build while a run uses it. It
 * prints `◇ Using the test build from <date>` or
 * `◇ Built the app for tests: <file> changed (<s>)` on stderr.
 *
 * @example
 * ```ts
 * export default defineConfig({
 *   test: {
 *     globalSetup: ["./tests/setup/database.ts", "@nuxvel/nuxt/testing/global-setup"],
 *     setupFiles: ["@nuxvel/nuxt/testing/setup"],
 *   },
 * });
 * ```
 *
 * @packageDocumentation
 */
import { loadNuxtConfig } from "@nuxt/kit";
import type { TestProject } from "vitest/node";
import { cachedTestBuild } from "./test-build";
import type {} from "./app-build";

/**
 * Builds the app at the project's root, or uses the cached build, and
 * hands it to `@nuxvel/nuxt/testing/setup` in every test file.
 */
export default async function buildAppForTests(project: TestProject) {
  const rootDir = project.config.root;
  const { buildDir, release } = await cachedTestBuild(rootDir);

  const { runtimeConfig } = await loadNuxtConfig({ cwd: rootDir });

  project.provide("nuxvelAppBuild", { rootDir, buildDir, siteUrlConfigured: Boolean(runtimeConfig.siteUrl) });

  return release;
}
