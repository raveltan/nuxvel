import type { ESLint, Linter } from "eslint";
import { actionImports } from "./rules/action-imports";
import { actionNaming } from "./rules/action-naming";
import { billingWrites } from "./rules/billing-writes";
import { functionalPageHtml } from "./rules/functional-page-html";
import { listenerEmitLoop } from "./rules/listener-emit-loop";
import { moduleImports } from "./rules/module-imports";
import { noAuditReads } from "./rules/no-audit-reads";
import { noParentImports } from "./rules/no-parent-imports";
import { noRawVHtml } from "./rules/no-raw-v-html";
import { routeWrites } from "./rules/route-writes";
import { routerDbWrites } from "./rules/router-db-writes";
import { routerOutput } from "./rules/router-output";
import { syncListenerNetwork } from "./rules/sync-listener-network";
import { testAuth } from "./rules/test-auth";
import { testClient } from "./rules/test-client";
import { testEach } from "./rules/test-each";
import { translationKeys } from "./rules/translation-keys";
import { typedRoutes } from "./rules/typed-routes";
import { userDataDeclared } from "./rules/user-data-declared";

const TEST_FILES = ["tests/**/*.ts", "server/**/*.test.ts", "app/**/*.stories.ts"].flatMap((path) => [path, `layers/*/${path}`]);
const IMPORT_FILES = ["server", "app", "shared", "tests"].flatMap((root) => [`${root}/**/*.ts`, `${root}/**/*.vue`]).flatMap((path) => [path, `layers/*/${path}`]);

/**
 * The `nuxvel` ESLint plugin: the architecture rules `nuxvel test:arch`
 * runs. `nuxvel/action-imports` keeps actions off the request (no `h3`,
 * no `auth()`, no request helpers), `nuxvel/action-naming` wants one
 * action per file exported under the file's camelCase name,
 * `nuxvel/router-db-writes` keeps `useDb().insert/update/delete` out of
 * tRPC routers, `nuxvel/router-output` wants an `.output()` schema on
 * every query and mutation built from a `*Procedure`, `nuxvel/route-writes` keeps those writes and action
 * calls out of Nitro routes, `nuxvel/sync-listener-network` keeps network calls
 * (`fetch`, `$fetch`, `sendMail`, `useS3`, ...) out of `sync: true`
 * listeners, `nuxvel/listener-emit-loop` stops a listener emitting the
 * event it listens to, and `nuxvel/user-data-declared` wants every table
 * with a `userId` column declared with `defineUserData()` in
 * `server/privacy/`, `nuxvel/no-raw-v-html` bans `v-html` in the
 * app, where `<SafeHtml>` renders sanitized HTML,
 * `nuxvel/typed-routes` wants a route name instead of an internal path
 * string in the `to` of `<NuxtLink>`, `<ULink>` and `<UButton>` and in
 * `navigateTo()`, `router.push()` and `router.replace()`,
 * `nuxvel/module-imports` lets a module in `layers/<a>/` import another
 * module `layers/<b>/` only from its `shared/` folder, and
 * `nuxvel/no-audit-reads` stops app server code reading the audit tables
 * (an import of `auditLogTable`, `auditSubjectsTable`,
 * `auditContextTable` or the `audit-log.schema` file, a member access
 * such as `schema.auditLogTable`, `schemaTable("audit_log")`, or a `sql`
 * template or `sql.raw()` string that names an audit table). The audit log is for compliance only.
 * `nuxvel/billing-writes` stops app server code writing the billing
 * tables (an `insert`, `update` or `delete` of `billingCustomersTable`,
 * `billingEventsTable`, `billingSubscriptionsTable`,
 * `billingPaymentsTable` or `schemaTable("billing_...")`, or a `sql`
 * template or `sql.raw()` string that inserts into, updates, deletes
 * from or truncates one). nuxvel writes them from Stripe's events.
 * `nuxvel/functional-page-html` stops a functional test reading the HTML
 * of a page (a `$fetch` of a page path, a `$fetch<string>`, or `.text()`
 * of a page `fetch`). A story or an end-to-end test checks what a page shows.
 * `nuxvel/test-each` wants `it.for` for tests that differ only by their
 * data: it reports `it.each`, `test.each` and `describe.each`, and `it`,
 * `test` or `describe` called in a loop.
 * `nuxvel/test-auth` wants a test's user from a factory: it reports a
 * sign-up or sign-in path of Better Auth outside the body of a test.
 * `nuxvel/test-client` wants the clients of `@nuxvel/nuxt/testing`: it
 * reports `$fetch`, `fetch` and `createPage` imported from
 * `@nuxt/test-utils/e2e`.
 * `nuxvel/translation-keys` wants each literal key of `$t`, `$ts`, `$tc`,
 * `t`, `ts`, `tc` and `<i18n-t keypath>` in a translation file of the
 * default locale; it checks nothing until its `keys` option lists the
 * known keys, which `nuxvel test:arch` passes.
 * `nuxvel/no-parent-imports` wants an alias (`#nuxvel/schema`,
 * `#nuxvel/factories`, `#server/*`, `#shared/*`, `~/*`, `#layers/<name>/*`)
 * for an import that climbs with `../` out of its kind folder into another
 * one, and fixes it, and removes an import of `shared/schemas/` from
 * `app/` and `server/`, which auto-import it; its `allow` option lists
 * globs of targets a relative import may reach. Use the plugin through
 * {@link architecture}.
 */
export const nuxvelPlugin: ESLint.Plugin = {
  meta: { name: "nuxvel" },
  rules: {
    "action-imports": actionImports,
    "action-naming": actionNaming,
    "billing-writes": billingWrites,
    "functional-page-html": functionalPageHtml,
    "listener-emit-loop": listenerEmitLoop,
    "module-imports": moduleImports,
    "no-audit-reads": noAuditReads,
    "no-parent-imports": noParentImports,
    "no-raw-v-html": noRawVHtml,
    "route-writes": routeWrites,
    "router-db-writes": routerDbWrites,
    "router-output": routerOutput,
    "sync-listener-network": syncListenerNetwork,
    "test-auth": testAuth,
    "test-client": testClient,
    "test-each": testEach,
    "translation-keys": translationKeys,
    "typed-routes": typedRoutes,
    "user-data-declared": userDataDeclared,
  },
};

/**
 * The nuxvel architecture lint preset: the {@link nuxvelPlugin} rules as
 * errors: the action rules on `server/actions/**`, the router rules on
 * `server/trpc/routers/**`, the listener rules on `server/listeners/**`,
 * the route rule on `server/api/**` and `server/routes/**`, the user
 * data rule on `server/database/schema/**`, the `v-html` rule on the
 * `.vue` files under `app/` and the route name rule on the `.vue` and `.ts`
 * files under `app/`, and the module rule on the `.ts` and `.vue`
 * files under `layers/<name>/`, and the audit and billing rules on every
 * `.ts` file under `server/` and `layers/<name>/server/`, and the import
 * rule on the `.ts` and `.vue` files under `server/`, `app/`, `shared/`
 * and `tests/`, also in `layers/<name>/`. The test configs apply to
 * the `.ts` files under `tests/`, the `.test.ts` files under `server/` and
 * the `.stories.ts` files under `app/`, and to the same paths in
 * `layers/<name>/`: the built-in `no-restricted-imports`
 * rule reports an `expect` import from `vitest`, `playwright/test`,
 * `@playwright/test` or `storybook/test`, because `expect` comes from
 * `@nuxvel/nuxt/testing` (or `@nuxvel/nuxt/storybook/test` in a story),
 * the `it.for`, the sign-up and the client rules apply to every test file,
 * and the page HTML rule applies to the functional tests (all but
 * `tests/e2e/` and the stories). The module rule sees explicit imports
 * only, not auto-imports. The action, router, listener and user data
 * rules also cover the same kinds in `server/domains/<domain>/`. The user
 * data rule also covers the tables of each module in `layers/<name>/`. The route rule skips probes
 * (`server/api/_*`) and routes under a `webhooks`, `uploads` or `auth`
 * folder. The audit rule skips the `audit-log.schema.ts` file that defines
 * the tables, and test files. The billing rule skips test files. The user data rule skips Better Auth's `session` and `account`
 * tables and the `audit_subjects` table. The configs are named `nuxvel/actions`, `nuxvel/routers`,
 * `nuxvel/listeners`, `nuxvel/routes`, `nuxvel/schema`,
 * `nuxvel/templates`, `nuxvel/modules`, `nuxvel/audit`, `nuxvel/billing`, `nuxvel/imports`, `nuxvel/tests`
 * and `nuxvel/functional-tests`. TypeScript files need a TypeScript parser, e.g.
 * `@typescript-eslint/parser`. Vue files need `vue-eslint-parser`,
 * which the accessibility preset of `@nuxvel/nuxt/eslint` sets.
 * `nuxvel test:arch` brings both parsers.
 *
 * @example
 * ```ts
 * // eslint.config.ts
 * import typescriptParser from "@typescript-eslint/parser";
 * import accessibility, { architecture } from "@nuxvel/nuxt/eslint";
 *
 * export default [
 *   { languageOptions: { parser: typescriptParser } },
 *   ...accessibility,
 *   ...architecture,
 * ];
 * ```
 */
export const architecture: Linter.Config[] = [
  {
    name: "nuxvel/actions",
    files: ["server/actions/**/*.ts", "server/domains/*/actions/**/*.action.ts"],
    plugins: { nuxvel: nuxvelPlugin },
    rules: { "nuxvel/action-imports": "error", "nuxvel/action-naming": "error" },
  },
  {
    name: "nuxvel/routers",
    files: ["server/trpc/routers/**/*.ts", "server/domains/*/routers/**/*.router.ts"],
    plugins: { nuxvel: nuxvelPlugin },
    rules: { "nuxvel/router-db-writes": "error", "nuxvel/router-output": "error" },
  },
  {
    name: "nuxvel/listeners",
    files: ["server/listeners/**/*.ts", "server/domains/*/listeners/**/*.listener.ts"],
    plugins: { nuxvel: nuxvelPlugin },
    rules: { "nuxvel/sync-listener-network": "error", "nuxvel/listener-emit-loop": "error" },
  },
  {
    name: "nuxvel/routes",
    files: ["server/api/**/*.ts", "server/routes/**/*.ts"],
    ignores: ["**/api/_*", "**/api/_*/**", "**/webhooks/**", "**/uploads/**", "**/auth/**"],
    plugins: { nuxvel: nuxvelPlugin },
    rules: { "nuxvel/route-writes": "error" },
  },
  {
    name: "nuxvel/schema",
    files: [
      "server/database/schema/**/*.ts",
      "server/domains/*/schema/**/*.schema.ts",
      "layers/*/server/database/schema/**/*.ts",
      "layers/*/server/domains/*/schema/**/*.schema.ts",
    ],
    plugins: { nuxvel: nuxvelPlugin },
    rules: { "nuxvel/user-data-declared": "error" },
  },
  {
    name: "nuxvel/templates",
    files: ["app/**/*.vue", "app/**/*.ts"],
    plugins: { nuxvel: nuxvelPlugin },
    rules: { "nuxvel/no-raw-v-html": "error", "nuxvel/typed-routes": "error" },
  },
  {
    name: "nuxvel/modules",
    files: ["layers/*/**/*.ts", "layers/*/**/*.vue"],
    plugins: { nuxvel: nuxvelPlugin },
    rules: { "nuxvel/module-imports": "error" },
  },
  {
    name: "nuxvel/audit",
    files: ["server/**/*.ts", "layers/*/server/**/*.ts"],
    ignores: ["**/database/schema/audit-log.schema.ts", "**/*.test.ts", "**/tests/**", "**/test/**"],
    plugins: { nuxvel: nuxvelPlugin },
    rules: { "nuxvel/no-audit-reads": "error" },
  },
  {
    name: "nuxvel/billing",
    files: ["server/**/*.ts", "layers/*/server/**/*.ts"],
    ignores: ["**/*.test.ts", "**/tests/**", "**/test/**"],
    plugins: { nuxvel: nuxvelPlugin },
    rules: { "nuxvel/billing-writes": "error" },
  },
  {
    name: "nuxvel/imports",
    files: IMPORT_FILES,
    plugins: { nuxvel: nuxvelPlugin },
    rules: { "nuxvel/no-parent-imports": "error" },
  },
  {
    name: "nuxvel/tests",
    files: TEST_FILES,
    plugins: { nuxvel: nuxvelPlugin },
    rules: {
      "nuxvel/test-each": "error",
      "nuxvel/test-auth": "error",
      "nuxvel/test-client": "error",
      "no-restricted-imports": [
        "error",
        {
          paths: ["vitest", "playwright/test", "@playwright/test", "storybook/test"].map((name) => ({
            name,
            importNames: ["expect"],
            message: "Import expect from @nuxvel/nuxt/testing in a test, or from @nuxvel/nuxt/storybook/test in a story.",
          })),
        },
      ],
    },
  },
  {
    name: "nuxvel/functional-tests",
    files: TEST_FILES,
    ignores: ["**/tests/e2e/**", "**/*.stories.ts"],
    plugins: { nuxvel: nuxvelPlugin },
    rules: { "nuxvel/functional-page-html": "error" },
  },
];
