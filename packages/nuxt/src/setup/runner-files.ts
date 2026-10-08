import { addTemplate } from "@nuxt/kit";
import type { Nuxt } from "@nuxt/schema";
import { getEnv } from "nitropack/runtime/internal/utils.env";
import type { Nitro } from "nitropack/types";

type Tree = { [key: string]: unknown };

function isTree(value: unknown): value is Tree {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Copies `config` with every leaf that a `NUXT_*` or `NITRO_*` variable
 * sets blanked. Nitro applies that variable at run time, so the file never
 * holds a value that came from the environment.
 */
function withoutEnvValues(config: Tree, envPrefix: string, parentKey = ""): Tree {
  return Object.fromEntries(
    Object.entries(config).map(([key, value]) => {
      const path = parentKey ? `${parentKey}_${key}` : key;
      if (isTree(value)) return [key, withoutEnvValues(value, envPrefix, path)];
      const fromEnv = getEnv(path, { prefix: "NITRO_", altPrefix: envPrefix });
      if (fromEnv === undefined || JSON.stringify(fromEnv) !== JSON.stringify(value)) return [key, value];
      return [key, typeof value === "number" ? 0 : typeof value === "boolean" ? false : typeof value === "string" ? "" : null];
    }),
  );
}

/**
 * Adds the three files the no-build runner (`@nuxvel/nuxt/runner`) reads
 * from `.nuxt/nuxvel/`, written from Nitro's final options:
 * `runtime-config.json` (the resolved runtime config, without the values
 * that `NUXT_*` variables set), `server-plugins.json` (the Nitro plugins in
 * order) and `tasks.json` (each task name with its handler file).
 */
export function writeRunnerFiles(nuxt: Nuxt) {
  let nitro: Nitro | undefined;
  nuxt.hook("nitro:init", (initialized) => {
    nitro = initialized;
  });

  const add = (filename: string, getData: (nitro: Nitro) => unknown) =>
    addTemplate({
      filename: `nuxvel/${filename}`,
      write: true,
      getContents: () => `${JSON.stringify(nitro ? getData(nitro) : {}, null, 2)}\n`,
    });

  add("runtime-config.json", ({ options }) => {
    const runtimeConfig: Tree = options.runtimeConfig;
    const nitroConfig = runtimeConfig.nitro;

    return withoutEnvValues(runtimeConfig, isTree(nitroConfig) && typeof nitroConfig.envPrefix === "string" ? nitroConfig.envPrefix : "_");
  });
  add("server-plugins.json", ({ options }) => options.plugins);
  add("tasks.json", ({ options }) => Object.fromEntries(Object.entries(options.tasks).map(([name, task]) => [name, task.handler])));
}
