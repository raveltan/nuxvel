import { defineNuxtPlugin, useRequestEvent, useRuntimeConfig } from "#app";
import { reportBrowserProblem, startBrowserPage, startReportingBrowserProblems } from "../devtools/report-browser-problem";

export default defineNuxtPlugin({
  name: "nuxvel:dev-browser-problems",
  enforce: "pre",
  setup(nuxtApp) {
    if (import.meta.server) {
      nuxtApp.payload.nuxvelRequestId = useRequestEvent()?.context.nuxvelRequestId;
      return;
    }

    if (Reflect.get(window, "__NUXT_DEVTOOLS_DISABLE__")) return;

    const requestId = nuxtApp.payload.nuxvelRequestId;

    startReportingBrowserProblems(useRuntimeConfig().app.baseURL, typeof requestId === "string" ? requestId : undefined);

    nuxtApp.hook("app:mounted", () => {
      nuxtApp.$router.afterEach(startBrowserPage);
    });

    const { config } = nuxtApp.vueApp;
    const previousWarnHandler = config.warnHandler;

    config.warnHandler = (message, instance, trace) => {
      const text = `[Vue warn]: ${message}${trace ? `\n${trace}` : ""}`;

      if (previousWarnHandler) previousWarnHandler(message, instance, trace);
      else console.warn(text);
      reportBrowserProblem("warn", undefined, text);
    };

    nuxtApp.hook("vue:error", (error) => reportBrowserProblem("error", error));
    nuxtApp.hook("app:error", (error) => reportBrowserProblem("error", error));
    window.addEventListener("error", (event) => reportBrowserProblem("error", event.error ?? event.message));
    window.addEventListener("unhandledrejection", (event) => reportBrowserProblem("error", event.reason));
  },
});
