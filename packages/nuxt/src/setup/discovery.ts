import { basename, dirname, join } from "node:path";
import { getLayerDirectories, resolveFiles } from "@nuxt/kit";
import type { Nuxt } from "@nuxt/schema";
import { DISCOVERY_IGNORE, type NamedFile, domainPatterns, nameFiles } from "../named-files";

export const DISCOVERED_FOLDERS = [
  "database/schema",
  "database/backfills",
  "jobs",
  "flags",
  "mail",
  "notifications",
  "uploads",
  "privacy",
  "webhooks",
  "products",
  "channels",
  "events",
  "actions",
  "listeners",
  "schedules",
  "rate-limits",
  "errors",
  "policies",
  "seeders",
  "factories",
  "trpc/routers",
] as const;

export type DiscoveredFolder = (typeof DISCOVERED_FOLDERS)[number];

export type Discovery = ReturnType<typeof createDiscovery>;

export function createDiscovery(nuxt: Nuxt) {
  const layerDirectories = getLayerDirectories(nuxt);
  const layerFolders = (folder: DiscoveredFolder) =>
    layerDirectories.map((dirs) => join(dirs.server, folder));
  const modulesDir = join(nuxt.options.rootDir, "layers");
  const moduleName = (root: string) => (dirname(root) === modulesDir ? basename(root) : undefined);
  const discoverLayers = (folder: DiscoveredFolder) =>
    Promise.all(
      layerDirectories.map(async (dirs) => {
        const dir = join(dirs.server, folder);
        const patterns = domainPatterns(folder);
        const files = await resolveFiles(dir, "**/*.ts", { ignore: DISCOVERY_IGNORE });
        const domainFiles = patterns.length
          ? await resolveFiles(join(dirs.server, "domains"), patterns, { ignore: DISCOVERY_IGNORE })
          : [];

        return { dir, files: [...files, ...domainFiles], module: moduleName(dirs.root) };
      }),
    );
  const discover = async (folder: DiscoveredFolder) => (await discoverLayers(folder)).flatMap(({ files }) => files);
  const discoverNamed = async (kind: string, folder: DiscoveredFolder, builtIns: NamedFile[] = []) =>
    nameFiles(kind, await discoverLayers(folder), builtIns);

  return { layerDirectories, layerFolders, discoverLayers, discover, discoverNamed };
}
