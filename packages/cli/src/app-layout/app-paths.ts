import { dirname, relative, resolve, sep } from "node:path";
import { loadNuxtConfig } from "@nuxt/kit";

export interface AppPaths {
  rootDir: string;
  buildDir: string;
  serverDir: string;
  appServerDir: string;
  sharedDir: string;
  pagesDir: string;
  componentsDir: string;
}

export async function resolveAppPaths(cwd: string): Promise<AppPaths> {
  // without _prepare, @nuxt/kit moves buildDir to node_modules/.cache when .nuxt exists, away from the one nuxt dev and nuxt prepare use
  const options = await loadNuxtConfig({ cwd, overrides: { _prepare: true } });

  return {
    rootDir: options.rootDir,
    buildDir: options.buildDir,
    serverDir: options.serverDir,
    appServerDir: options.serverDir,
    sharedDir: resolve(options.rootDir, options.dir.shared),
    pagesDir: resolve(options.srcDir, options.dir.pages),
    componentsDir: resolve(options.srcDir, "components"),
  };
}

export function rootPathFrom(file: string, rootDir: string) {
  return `${relative(dirname(file), rootDir).split(sep).join("/")}/`;
}
