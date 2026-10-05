import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineCommand } from "citty";
import { loadEnvFile } from "../env/load-env-file.ts";
import { requireDatabaseUrl } from "../env/require-database-url.ts";
import { runProjectBin } from "../run-project-bin.ts";
import { fail } from "../ui/fail.ts";

function studioConfig(appConfig: string) {
  return [
    `import config from ${JSON.stringify(appConfig)};`,
    "",
    "export default { dbCredentials: { url: process.env.NUXT_DATABASE_URL }, ...config };",
    "",
  ].join("\n");
}

export default defineCommand({
  meta: {
    name: "db:studio",
    description:
      "Open Drizzle Studio on the app's schema and NUXT_DATABASE_URL, from the shell or .env (passthrough to `drizzle-kit studio`, extra arguments included).",
  },
  async run({ rawArgs }) {
    const cwd = process.cwd();
    const appConfig = join(cwd, "drizzle.config.ts");

    loadEnvFile(cwd);

    if (!existsSync(appConfig)) fail(`No drizzle.config.ts in ${cwd}`, { hint: "Run nuxvel db:studio from the app's directory" });

    requireDatabaseUrl(["NUXT_DATABASE_URL"]);
    const dir = await mkdtemp(join(tmpdir(), "nuxvel-studio-"));
    const config = join(dir, "drizzle.config.ts");

    try {
      await writeFile(config, studioConfig(appConfig));
      process.exitCode = await runProjectBin(cwd, "drizzle-kit", ["studio", "--config", config, ...rawArgs], {
        installHint: "npm i -D drizzle-kit",
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
});
