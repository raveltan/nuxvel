import { readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { loadNuxtConfig } from "@nuxt/kit";

interface ManifestChunk {
  file: string;
  isEntry?: boolean;
  imports?: string[];
  css?: string[];
}

type ClientManifest = Record<string, ManifestChunk>;

interface PageBundle {
  page: string;
  kb: number;
}

function initialFiles(manifest: ClientManifest, key: string, files = new Set<string>()) {
  const chunk = manifest[key];

  if (!chunk || files.has(chunk.file)) return files;

  files.add(chunk.file);
  for (const css of chunk.css ?? []) files.add(css);
  for (const imported of chunk.imports ?? []) initialFiles(manifest, imported, files);

  return files;
}

export async function measurePageBundles(cwd: string) {
  const options = await loadNuxtConfig({ cwd }).catch(() => undefined);
  // loadNuxtConfig types none of a module's config keys
  const budgetKb = (options as { nuxvel?: { perf?: { bundle?: { maxInitialKb?: number } } } } | undefined)?.nuxvel
    ?.perf?.bundle?.maxInitialKb;

  if (!options || budgetKb === undefined) return undefined;

  const manifestFile = pathToFileURL(join(options.buildDir, "dist", "server", "client.manifest.mjs")).href;
  const manifest: ClientManifest = (await import(manifestFile)).default;
  const assetsDir = join(options.buildDir, "dist", "client", options.app.buildAssetsDir);
  const pagesPrefix = `${relative(options.srcDir, resolve(options.srcDir, options.dir.pages))}/`;
  const entries = Object.keys(manifest).filter((key) => manifest[key]?.isEntry);
  const gzippedBytes = (file: string) => gzipSync(readFileSync(join(assetsDir, file))).length;
  const pages: PageBundle[] = Object.keys(manifest)
    .filter((key) => key.startsWith(pagesPrefix))
    .sort()
    .map((page) => {
      const files = entries.reduce((found, entry) => initialFiles(manifest, entry, found), initialFiles(manifest, page));
      const bytes = [...files].reduce((total, file) => total + gzippedBytes(file), 0);

      return { page, kb: Math.round(bytes / 102.4) / 10 };
    });

  return { budgetKb, pages };
}
