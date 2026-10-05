import { addDevServerHandler, addPlugin, addServerHandler, addServerPlugin, resolveFiles } from "@nuxt/kit";
import { addCustomTab } from "@nuxt/devtools-kit";
import type { Nuxt } from "@nuxt/schema";
import { QUEUE_BOARD_PATH } from "../runtime/server/jobs/board-path";
import { DEVTOOLS_PATH } from "../runtime/server/devtools/devtools-path";
import { BROWSER_PROBLEMS_PATH } from "../runtime/shared/devtools/browser-problem";
import { devtoolsAccessGate } from "../devtools-access";
import { devtoolsClientHandler } from "../devtools-client";
import type { RuntimeFile } from "./resolved-options";

export async function setupDevtools(nuxt: Nuxt, runtimeFile: RuntimeFile) {
  if (!nuxt.options.dev) return;

  const queueBoardHandler = runtimeFile("./runtime/server/routes/queue-board");

  addServerHandler({ route: QUEUE_BOARD_PATH, handler: queueBoardHandler });
  addServerHandler({
    route: `${QUEUE_BOARD_PATH}/**`,
    handler: queueBoardHandler,
  });

  addServerHandler({
    route: `${DEVTOOLS_PATH}/api/stream`,
    method: "get",
    handler: runtimeFile("./runtime/server/routes/devtools-stream"),
  });
  addServerHandler({
    route: `${DEVTOOLS_PATH}/api/entries/:id`,
    method: "get",
    handler: runtimeFile("./runtime/server/routes/devtools-entry"),
  });
  addServerHandler({
    route: `${DEVTOOLS_PATH}/api/mail-preview`,
    method: "post",
    handler: runtimeFile("./runtime/server/routes/devtools-mail-preview"),
  });
  addServerHandler({
    route: `${DEVTOOLS_PATH}/api/explain`,
    method: "post",
    handler: runtimeFile("./runtime/server/routes/devtools-explain"),
  });
  addServerHandler({
    route: BROWSER_PROBLEMS_PATH,
    method: "post",
    handler: runtimeFile("./runtime/server/routes/devtools-browser-problems"),
  });
  nuxt.options.routeRules ??= {};
  // a Vue warning's component trace looks like HTML to nuxt-security's XSS validator, which would refuse it
  nuxt.options.routeRules[BROWSER_PROBLEMS_PATH] = { security: { xssValidator: false } };
  addPlugin(runtimeFile("./runtime/app/plugins/dev-browser-problems"));
  const sectionFiles = await resolveFiles(runtimeFile("./runtime/server/devtools/sections"), [
    "*.{ts,js}",
    "!*.d.ts",
  ]);

  for (const file of sectionFiles) addServerPlugin(file);

  const basePath = nuxt.options.app.baseURL.replace(/\/+$/, "");
  const guardedPaths = [DEVTOOLS_PATH, QUEUE_BOARD_PATH].flatMap((path) => [path, `${basePath}${path}`]);

  addDevServerHandler({ handler: devtoolsAccessGate(guardedPaths) });
  addDevServerHandler({ handler: devtoolsClientHandler(runtimeFile("../client-dist"), DEVTOOLS_PATH) });
  addCustomTab({
    name: "nuxvel",
    title: "nuxvel",
    icon: "carbon:data-base",
    category: "server",
    view: { type: "iframe", src: `${DEVTOOLS_PATH}/`, persistent: false },
    requireAuth: true,
  });
}
