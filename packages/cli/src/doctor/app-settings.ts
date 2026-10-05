import { loadNuxtConfig } from "@nuxt/kit";

let config: ReturnType<typeof loadNuxtConfig> | undefined;

export function appConfig(cwd: string) {
  config ??= loadNuxtConfig({ cwd });
  return config;
}

export async function usesNuxvel(cwd: string) {
  const { modules } = await appConfig(cwd);

  return modules.includes("@nuxvel/nuxt");
}

export async function appSettings(cwd: string) {
  const { environmentSettings } = await import("@nuxvel/nuxt/env");
  const runtimeConfig = await appConfig(cwd).then(
    (options) => options.runtimeConfig,
    () => ({}),
  );

  return environmentSettings(process.env, runtimeConfig);
}
