import { join, resolve } from "node:path";
import type { Nuxt } from "@nuxt/schema";
import { DISCOVERED_FOLDERS, type Discovery } from "./discovery";
import type { Namespaces } from "./namespaces";

export function reloadOnDefinitionChanges(nuxt: Nuxt, { layerDirectories, layerFolders }: Discovery, namespaces: Namespaces) {
  if (!nuxt.options.dev) return;

  const domainFolders = layerDirectories.map((dirs) => join(dirs.server, "domains"));
  const watchedFolders = [...DISCOVERED_FOLDERS.flatMap(layerFolders), ...domainFolders];

  let restarting = false;
  const aliasesChanged = async (changed: Namespaces) => {
    for (const namespace of changed) {
      if (Object.keys(await namespace.build()).sort().join() !== [...namespace.aliases].sort().join()) return true;
    }

    return false;
  };

  nuxt.hook("nitro:init", (nitro) => {
    let built = false;
    const restart = () => {
      restarting = true;
      return nuxt.callHook("restart");
    };

    // a definition file added while this instance started up is in no namespace yet, and a restart before the first build leaves the dev server down
    nitro.hooks.hookOnce("compiled", async () => {
      built = true;
      if (!restarting && (await aliasesChanged(namespaces))) await restart();
    });

    nuxt.hook("builder:watch", async (event, relativePath) => {
      if (restarting || (event !== "add" && event !== "unlink")) return;
      const path = resolve(nuxt.options.srcDir, relativePath);

      // each namespace module is registered once at setup, so a new or emptied definition folder needs a fresh setup
      const inDomain = domainFolders.some((dir) => path.startsWith(`${dir}/`));
      const affected = namespaces.filter(({ folder }) => inDomain || layerFolders(folder).some((dir) => path.startsWith(`${dir}/`)));
      if (await aliasesChanged(affected)) {
        if (built && !restarting) await restart();
        return;
      }

      if (!path.endsWith(".ts") && !path.endsWith(".vue")) return;
      if (!watchedFolders.some((folder) => path.startsWith(`${folder}/`))) return;

      await nitro.hooks.callHook("rollup:reload");
    });
  });
}
