import { resolve } from "node:path";
import { addComponent } from "@nuxt/kit";
import type { Nuxt } from "@nuxt/schema";
import type { ResolvedOptions, RuntimeFile } from "./resolved-options";

export function setupMaintenance(nuxt: Nuxt, options: ResolvedOptions, runtimeFile: RuntimeFile) {
  addComponent({
    name: "Maintenance",
    filePath: runtimeFile(
      options.ui ? "./runtime/app/maintenance/UiMaintenance.vue" : "./runtime/app/maintenance/Maintenance.vue",
    ),
  });
  nuxt.hook("app:resolve", (app) => {
    if (app.errorComponent === resolve(nuxt.options.appDir, "components/nuxt-error-page.vue")) {
      app.errorComponent = runtimeFile("./runtime/app/maintenance/ErrorPage.vue");
    }
  });
  // the maintenance 503 must answer before any other middleware does work for the request
  nuxt.options.serverHandlers.unshift({
    middleware: true,
    handler: runtimeFile("./runtime/server/maintenance/middleware"),
  });
}
