import { afterAll, beforeAll } from "vitest";
import { setupApp } from "./helpers/playground";
import { createScratchApp, removeScratchApp, scratchAppDir } from "./helpers/scratch-app";
import { addDomainFolders } from "./scratch-app/domain-folders";
import { BUILD_DSN, writeDotenv } from "./scratch-app/dotenv";
import { cspWithoutConnectSrc } from "./scratch-app/error-tracking-csp";
import { removeI18nConfig } from "./scratch-app/i18n-one-locale";
import { addBaseLayer } from "./scratch-app/layer-discovery";
import "./scratch-app/login-rate-limit";
import "./scratch-app/seo-off";
import { makeGadgetPolicy } from "./scratch-app/make-policy";
import { addProtectedPage, cachedPages, recordBuildWarnings } from "./scratch-app/private-page-guard";
import { PWA_OPTIONS, addPwaPages } from "./scratch-app/pwa";
import { addConsoleProbePage, ownSecurityOptions } from "./scratch-app/security-overrides";
import { addServerAliasChecks } from "./scratch-app/server-aliases";
import { addSocialSignIn, githubSignIn } from "./scratch-app/social-login";
import { SMOKE_ROUTE_RULES, addSmokePages } from "./scratch-app/smoke";
import { addTableNameChecks } from "./scratch-app/table-names";
import { addUserDataEraseCheck } from "./scratch-app/user-data-undeclared";

const appDir = scratchAppDir("scratch-app");

beforeAll(() => {
  createScratchApp(appDir);
  writeDotenv(appDir);
  removeI18nConfig(appDir);
  addTableNameChecks(appDir);
  addServerAliasChecks(appDir);
  addBaseLayer(appDir);
  addDomainFolders(appDir);
  makeGadgetPolicy(appDir);
  addUserDataEraseCheck(appDir);
  addSocialSignIn(appDir);
  addProtectedPage(appDir);
  addConsoleProbePage(appDir);
  addPwaPages(appDir);
  addSmokePages(appDir);
}, 60_000);
afterAll(() => removeScratchApp(appDir));
recordBuildWarnings();

await setupApp({
  rootDir: appDir,
  browser: true,
  nuxtConfig: {
    nuxvel: { ...githubSignIn.nuxvel, rendering: cachedPages, pwa: PWA_OPTIONS },
    runtimeConfig: { public: { sentryDsn: BUILD_DSN } },
    routeRules: SMOKE_ROUTE_RULES,
    security: { ...ownSecurityOptions, ...cspWithoutConnectSrc },
  },
  env: githubSignIn.env,
});
