import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { runNuxtChild } from "../app-server/run-nuxt-child.ts";

const appLayoutSchema = z.object({
  rootDir: z.string(),
  serverDir: z.string(),
  serverDirs: z.array(z.string()),
  files: z.record(z.string(), z.array(z.string())),
  appFiles: z.array(z.string()),
  layerRoots: z.array(z.string()),
  translations: z.object({
    defaultLocale: z.string(),
    locales: z.array(z.string()),
    dir: z.string(),
    additionalDirs: z.array(z.string()),
  }),
});

export type AppLayout = z.infer<typeof appLayoutSchema>;

export async function loadAppLayout(cwd: string, folders: string[] = []): Promise<AppLayout> {
  const dir = await mkdtemp(join(tmpdir(), "nuxvel-layout-"));
  const outFile = join(dir, "layout.json");

  try {
    await runNuxtChild(join(import.meta.dirname, "layout-entry.ts"), [cwd, outFile, JSON.stringify(folders)], cwd);

    const layout = appLayoutSchema.safeParse(JSON.parse(await readFile(outFile, "utf8")));

    if (!layout.success) throw new Error(`nuxvel: unexpected app layout in ${outFile}`);

    return layout.data;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
