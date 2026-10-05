/**
 * Vitest setup file for functional and end-to-end tests: starts the app
 * for each test file, registers the nuxvel matchers and clears what the
 * app's fakes recorded, and the cached values and pages, before the first test and after every test. List it in `setupFiles`.
 *
 * Each test file gets its own server, started before its first test from
 * the build that `@nuxvel/nuxt/testing/global-setup` made once for the
 * run. Environment variables that the file sets on `process.env` at its
 * top level reach its server. `NUXT_SITE_URL` is the address of that
 * server unless `process.env` or the app's `runtimeConfig.siteUrl` already sets it,
 * and `NUXT_AUDIT_CHAIN_SECRET`, `NUXT_STRIPE_SECRET_KEY` and `NUXT_STRIPE_WEBHOOK_SECRET` are fixed test values unless `process.env` sets them. A browser starts on the first `visit()` or
 * `createPage()` of the file. Without the global setup, it starts no
 * server.
 *
 * The browser is headless unless `NUXVEL_HEADED=1` is set.
 * `NUXVEL_DEVTOOLS=1` shows the browser with the Chrome DevTools open in
 * each tab.
 * `NUXVEL_SLOW_MO=<ms>` slows each browser operation down by that many
 * milliseconds. When `PWDEBUG=1` is set, Playwright shows the browser and
 * opens its inspector, and the Vitest test and hook timeouts and
 * `nuxvelBrowserTimeout` are off, so a test can stop at `page.pause()`.
 *
 * When `NUXVEL_CHANGES_DIR` is set, it also records the modules that the
 * test file loaded, for `@nuxvel/nuxt/testing/changes-reporter`.
 *
 * @example
 * ```ts
 * export default defineConfig({
 *   test: { setupFiles: ["@nuxvel/nuxt/testing/setup"] },
 * });
 * ```
 *
 * @packageDocumentation
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setup } from "@nuxt/test-utils/e2e";
import { type EvaluatedModules, afterAll, afterEach, beforeAll, beforeEach, expect, inject, vi } from "vitest";
import type {} from "./app-build";
import { setTestClock } from "../runtime/server/clock/now";
import { changesDirFor } from "./changes-dir";
import { playwrightDebug } from "./debug";
import "./matchers";
import { serverAddress } from "./server-address";
import { postToControlChannel, rememberTestServer } from "./control-channel";

const build = inject("nuxvelAppBuild");
const changesDir = process.env.NUXVEL_CHANGES_DIR;
const testFile = expect.getState().testPath;
const devtools = process.env.NUXVEL_DEVTOOLS === "1";

if (build) {
  await setup({
    rootDir: build.rootDir,
    buildDir: build.buildDir,
    build: false,
    browserOptions: {
      type: "chromium",
      launch: {
        headless: process.env.NUXVEL_HEADED !== "1" && !devtools,
        slowMo: Number(process.env.NUXVEL_SLOW_MO) || undefined,
        args: devtools ? ["--auto-open-devtools-for-tabs"] : undefined,
      },
    },
    ...(await serverAddress({
      siteUrlConfigured: build.siteUrlConfigured,
      env: changesDir && testFile ? { NODE_V8_COVERAGE: join(changesDirFor(changesDir, testFile), "coverage") } : {},
    })),
  });
}

if (playwrightDebug) vi.setConfig({ testTimeout: 0, hookTimeout: 0 });

beforeAll(async () => {
  rememberTestServer();
  await postToControlChannel("reset");
});

beforeEach(() => {
  rememberTestServer();
});

afterEach(async () => {
  await postToControlChannel("reset");
  setTestClock(undefined);
});

afterAll(() => {
  if (!changesDir || !testFile) return;

  const dir = changesDirFor(changesDir, testFile);
  // vitest has no public API for the modules that a test file loaded
  const { evaluatedModules } = (globalThis as unknown as { __vitest_worker__: { evaluatedModules: EvaluatedModules } }).__vitest_worker__;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "modules.json"), JSON.stringify([...evaluatedModules.fileToModulesMap.keys()]));
});
