import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";
import { addServerTemplate } from "@nuxt/kit";
import type { Nuxt } from "@nuxt/schema";
import type { RuntimeFile } from "./setup/resolved-options";

const ENTRIES_DIR = "nuxvel";

export function addReleaseEntries(
  nuxt: Nuxt,
  runtimeFile: RuntimeFile,
  auditRetentionMonths: number | undefined,
) {
  const entries: Record<string, string> = {
    migrate: `import { runReleaseMigrations } from ${JSON.stringify(runtimeFile("./runtime/release/migrate"))};\nawait runReleaseMigrations(new URL("./migrations", import.meta.url));\n`,
    maintenance: `import { runMaintenance } from ${JSON.stringify(runtimeFile("./runtime/release/maintenance"))};\nawait runMaintenance(${JSON.stringify({ retentionMonths: auditRetentionMonths })});\n`,
  };
  // a test build's seeder routes import the seeders before $seeders, so tinker's #imports would build $seeders before a seeder that uses it; the CLI's own build has its tinker
  if (!nuxt.options.test && !nuxt.options.nitro.plugins?.includes(runtimeFile("./runtime/server/plugins/command"))) {
    // the chunk that boots the nitro app listens as it loads, so the port is set before a dynamic import loads it
    entries.tinker = `import { takeFreeLoopbackPort } from ${JSON.stringify(runtimeFile("./runtime/release/tinker-port"))};\nawait takeFreeLoopbackPort();\nconst { startTinker } = await import(${JSON.stringify(runtimeFile("./runtime/release/tinker"))});\nawait startTinker(new URL("../index.mjs", import.meta.url));\n`;
  }
  const entryId = (name: string) => `#nuxvel/release/${name}`;

  for (const [name, code] of Object.entries(entries)) {
    addServerTemplate({ filename: entryId(name), getContents: () => code });
  }

  nuxt.hook("nitro:init", (nitro) => {
    if (nitro.options.dev) return;

    nitro.hooks.hook("rollup:before", (_nitro, config) => {
      const output = Array.isArray(config.output) ? undefined : config.output;

      if (typeof config.input !== "string" || output?.entryFileNames !== "index.mjs") return;

      config.input = {
        index: config.input,
        ...Object.fromEntries(Object.keys(entries).map((name) => [`${ENTRIES_DIR}/${name}`, entryId(name)])),
      };
      output.entryFileNames = "[name].mjs";

      const manualChunks = output.manualChunks;
      const shared = new Set(
        ["audit/audit-partitions", "audit/audit-export", "storage/storage-client"].map((file) => runtimeFile(`./runtime/server/${file}`)),
      );
      // rollup would merge these modules, shared with the server, into the chunk that boots the nitro app
      output.manualChunks = (id, meta) =>
        shared.has(id.replace(/\.[jt]s$/, "")) ? "audit-partitions" : typeof manualChunks === "function" ? manualChunks(id, meta) : undefined;
    });

    nitro.hooks.hook("compiled", () => {
      const migrations = join(nuxt.options.rootDir, "server", "database", "migrations");

      if (existsSync(migrations)) {
        cpSync(migrations, join(nitro.options.output.serverDir, ENTRIES_DIR, "migrations"), { recursive: true });
      }
    });
  });
}
