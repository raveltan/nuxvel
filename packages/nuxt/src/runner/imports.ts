import { join } from "node:path";
import * as h3 from "h3";
import { createUnimport } from "unimport";
import type { Plugin } from "vite";

const IMPORTS_ID = "#imports";
const APP_FILE = /\.(?:m?[jt]s|vue)(?:\?|$)/;

/**
 * A Vite plugin that gives the app's server files Nitro's auto-imports: the
 * h3 functions, the runner's Nitro shim and the app's `server/utils/`,
 * `shared/utils/` and `shared/types/` folders. It also serves the
 * `#imports` module, which `trpc-nuxt/server` imports. Only files under
 * `rootDir` are changed, so the framework's own files keep their explicit
 * imports.
 */
export async function importsPlugin(rootDir: string, shimFile: string): Promise<Plugin> {
  const unimport = createUnimport({
    presets: [
      { from: "h3", imports: Object.keys(h3).filter((name) => !/^[A-Z]/.test(name) && name !== "use") },
      { from: shimFile, imports: ["useNitroApp", "useRuntimeConfig", "useStorage", "useEvent", "defineNitroPlugin", "defineTask", "runTask"] },
    ],
    dirs: ["server/utils", "shared/utils", "shared/types"].map((dir) => join(rootDir, dir, "**/*")),
  });

  await unimport.init();

  return {
    name: "nuxvel:runner-imports",
    enforce: "post",
    resolveId: (id) => (id === IMPORTS_ID ? `\0${IMPORTS_ID}` : undefined),
    load: (id) => (id === `\0${IMPORTS_ID}` ? unimport.toExports() : undefined),
    async transform(code, id) {
      if (!id.startsWith(rootDir) || id.includes("/node_modules/") || id.includes("/.nuxt/") || !APP_FILE.test(id)) return undefined;

      const { s } = await unimport.injectImports(code, id);

      return s.hasChanged() ? { code: s.toString(), map: s.generateMap({ hires: true, source: id }) } : undefined;
    },
  };
}
