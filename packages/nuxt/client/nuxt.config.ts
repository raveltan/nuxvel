import { fileURLToPath } from "node:url";
import DevtoolsUIKit from "@nuxt/devtools-ui-kit";

export default defineNuxtConfig({
  compatibilityDate: "2026-09-01",
  ssr: false,
  modules: [DevtoolsUIKit],
  devtools: { enabled: false },
  telemetry: false,
  app: {
    baseURL: "/_nuxvel/devtools/",
    head: { title: "nuxvel" },
  },
  experimental: { appManifest: false },
  nitro: {
    output: { publicDir: fileURLToPath(new URL("../client-dist", import.meta.url)) },
  },
});
