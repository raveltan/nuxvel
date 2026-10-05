import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildNuxt, loadNuxt, writeTypes } from "@nuxt/kit";
import { COMMAND_PLUGIN, recordEnvReads } from "@nuxvel/nuxt/cli";

const [cwd, dir] = process.argv.slice(2);

if (!cwd || !dir) throw new Error("usage: build-entry <cwd> <dir>");

// @nuxt/icon inlines every icon collection for an HTTP endpoint that no command serves, and its config type is the app's
const appModuleOverrides = { icon: { serverBundle: false } };

async function build(cwd: string, dir: string) {
  const nuxt = await loadNuxt({
    cwd,
    dev: false,
    // the parent loaded .env with the config already, and a second merge would read every variable while recordEnvReads watches
    dotenv: false,
    overrides: {
      ...appModuleOverrides,
      // Nuxt turns `test` on under NODE_ENV=test, which would swap the app's real effects for the test fakes
      test: false,
      buildDir: join(dir, ".nuxt"),
      // a command needs only the server: no Vite bundle, and no Vue renderer that would import one
      builder: { bundle: async () => {} },
      experimental: { noVueServer: true },
      nitro: {
        preset: "node-listener",
        output: { dir: join(dir, ".output") },
        plugins: [COMMAND_PLUGIN],
        externals: { trace: false },
        // route rules with prerender: true add their routes after the config is read, so the hook empties the set
        prerender: { crawlLinks: false },
        hooks: { "prerender:routes": (routes: Set<string>) => routes.clear() },
        minify: false,
        // `npm run test:coverage` maps a command's server back to the source files
        sourceMap: process.env.NODE_V8_COVERAGE !== undefined,
        // a command runs in the environment of the shell that starts it, not a production one fixed at build
        replace: { "process.env.NODE_ENV": "process.env.NODE_ENV" },
      },
    },
  });

  try {
    await writeTypes(nuxt);
    await buildNuxt(nuxt);
  } finally {
    await nuxt.close();
  }
}

await writeFile(join(dir, "env-reads.json"), JSON.stringify(await recordEnvReads(() => build(cwd, dir))));
