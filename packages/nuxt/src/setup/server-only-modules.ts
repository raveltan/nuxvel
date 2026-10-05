import { addServerTemplate, addTemplate, addVitePlugin } from "@nuxt/kit";
import type { Nuxt } from "@nuxt/schema";
import type { GeneratedModule } from "./generated-modules";

export function registerServerOnlyModules(nuxt: Nuxt, modules: Record<string, GeneratedModule>) {
  const serverOnlyModules: Record<string, string> = {};

  // nitro resolves these in memory: @nuxt/test-utils shares one build dir across workers, so a written template can vanish mid-build
  for (const [alias, getContents] of Object.entries(modules)) {
    const { dst } = addTemplate({ filename: `${alias.slice(1)}.ts`, getContents, write: true });
    addServerTemplate({ filename: alias, getContents });
    serverOnlyModules[alias] = dst;
  }

  nuxt.options.nitro.alias = { ...nuxt.options.nitro.alias, ...serverOnlyModules };
  nuxt.hook("prepare:types", ({ tsConfig }) => {
    tsConfig.compilerOptions ??= {};
    tsConfig.compilerOptions.paths ??= {};
    for (const [alias, dst] of Object.entries(serverOnlyModules)) {
      tsConfig.compilerOptions.paths[alias] = [dst];
    }
  });
  addVitePlugin({
    name: "nuxvel:server-only-modules",
    enforce: "pre",
    resolveId(id, importer) {
      if (!(id in serverOnlyModules)) return;
      this.error(
        `${id} is generated server code and cannot be imported from ${importer ?? "the app"}. Import it from server/ code, or move what the app needs to shared/.`,
      );
    },
  });
}
