import type { Nuxt } from "@nuxt/schema";
import { scanServerRoutes } from "nitropack/core";
import type { buildNitroRoutesModuleCode } from "../nitro-routes";

export type NitroScan = ReturnType<typeof trackNitroScan>;

export function trackNitroScan(nuxt: Nuxt) {
  let scannedHandlers: () => ReturnType<typeof scanServerRoutes> = async () => [];
  let handlers: () => Promise<Parameters<typeof buildNitroRoutesModuleCode>[0]> = async () => [];
  let taskNames: () => string[] = () => [];
  nuxt.hook("nitro:init", (nitro) => {
    // scannedHandlers keeps one file per method and path; a fresh scan keeps the collisions `nuxvel routes` reports
    scannedHandlers = async () => [
      ...(await scanServerRoutes(nitro, nitro.options.apiDir || "api", nitro.options.apiBaseURL || "/api")),
      ...(await scanServerRoutes(nitro, nitro.options.routesDir || "routes")),
    ];
    handlers = async () => [...(await scannedHandlers()), ...nitro.options.handlers];
    taskNames = () => Object.keys(nitro.options.tasks);
  });

  return {
    scannedHandlers: () => scannedHandlers(),
    handlers: () => handlers(),
    taskNames: () => taskNames(),
  };
}
