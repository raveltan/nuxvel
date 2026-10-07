import { join } from "node:path";
import { addServerTemplate, addTemplate, addVitePlugin } from "@nuxt/kit";
import type { Nuxt } from "@nuxt/schema";
import type { RedirectTypes } from "./editor-types";
import type { GeneratedModule } from "./generated-modules";

// an app's package.json imports load these two written files at runtime
const RUNTIME_READ = new Set(["#nuxvel/schema", "#nuxvel/factories"]);

export function registerServerOnlyModules(nuxt: Nuxt, modules: Record<string, GeneratedModule>, redirectTypes?: RedirectTypes) {
  const serverOnlyModules: Record<string, string> = {};

  // nitro resolves these in memory: @nuxt/test-utils shares one build dir across workers, so a written template can vanish mid-build
  for (const [alias, getContents] of Object.entries(modules)) {
    const filename = `${alias.slice(1)}.ts`;
    const written = redirectTypes && !RUNTIME_READ.has(alias) ? async () => redirectTypes(await getContents(), join(nuxt.options.buildDir, filename)) : getContents;
    const { dst } = addTemplate({ filename, getContents: written, write: true });
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
