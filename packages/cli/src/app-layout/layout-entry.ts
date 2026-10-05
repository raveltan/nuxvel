import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { getLayerDirectories, loadNuxt, resolveFiles, runWithNuxtContext } from "@nuxt/kit";
import { domainPatterns } from "@nuxvel/nuxt/cli";

const SKIPPED = ["**/*.d.ts", "**/*.test.ts", "**/*.spec.ts"];

const [cwd, outFile, foldersJson] = process.argv.slice(2);

if (!cwd || !outFile || !foldersJson) throw new Error("usage: layout-entry <cwd> <outFile> <folders>");

const folders: unknown = JSON.parse(foldersJson);

if (!Array.isArray(folders) || !folders.every((folder) => typeof folder === "string")) {
  throw new Error("layout-entry: folders must be a JSON array of strings");
}

// Nuxt turns `test` on under NODE_ENV=test, and an app's modules may lay out test builds differently
const nuxt = await loadNuxt({ cwd, dev: false, overrides: { test: false } });

try {
  await runWithNuxtContext(nuxt, async () => {
    const layers = getLayerDirectories(nuxt);
    const serverDirs = layers.map((dirs) => resolve(dirs.server));
    const appFiles = (await Promise.all(layers.map((dirs) => resolveFiles(dirs.app, ["**/*.vue", "**/*.ts"], { ignore: SKIPPED })))).flat();
    const files = Object.fromEntries(
      await Promise.all(
        folders.map(async (folder) => [
          folder,
          (
            await Promise.all(
              serverDirs.flatMap((dir) => [
                resolveFiles(join(dir, folder), "**/*.ts", { ignore: SKIPPED }),
                domainPatterns(folder).length
                  ? resolveFiles(join(dir, "domains"), domainPatterns(folder), { ignore: SKIPPED })
                  : [],
              ]),
            )
          ).flat(),
        ]),
      ),
    );

    const { i18n = {} } = nuxt.options as {
      i18n?: { defaultLocale?: string; locales?: { code: string }[]; translationDir?: string; additionalTranslationDirs?: string[] };
    };
    const translations = {
      defaultLocale: i18n.defaultLocale ?? "en",
      locales: (i18n.locales ?? []).map((locale) => locale.code),
      dir: i18n.translationDir ?? "locales",
      additionalDirs: i18n.additionalTranslationDirs ?? [],
    };
    const layerRoots = layers.map((dirs) => resolve(dirs.root));

    await writeFile(
      outFile,
      JSON.stringify({ rootDir: nuxt.options.rootDir, serverDir: nuxt.options.serverDir, serverDirs, files, appFiles, layerRoots, translations }),
    );
  });
} finally {
  await nuxt.close();
}
