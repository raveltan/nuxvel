import { join, relative } from "node:path";
import { type AppPaths, resolveAppPaths } from "../app-layout/app-paths.ts";
import { type GeneratedFile, writeGeneratedFiles } from "../generated/write-generated.ts";
import { print, report, style, symbols } from "../ui/output.ts";
import { fail } from "../ui/fail.ts";
import { devServerRunning } from "./dev-server-running.ts";
import { runNuxiPrepare } from "./nuxi-prepare.ts";
import { kebabName, requireFile } from "./names.ts";
import { errorMessage } from "../error-message.ts";

export async function generate(
  cwd: string,
  plan: (paths: AppPaths) => GeneratedFile[] | Promise<GeneratedFile[]>,
  options: { force: boolean; prepare?: boolean; module?: string },
) {
  const app = await loadPaths(cwd);
  const paths = options.module ? await modulePaths(app, options.module) : app;

  for (const path of writeGeneratedFiles(cwd, await plan(paths), options)) {
    print(`${symbols.success} Created ${style.path(relative(cwd, path))}`);
  }

  if (!(options.prepare ?? true)) return;

  if (devServerRunning(paths.buildDir)) {
    report(`${symbols.skipped} Types update in the running nuxt dev (nuxt prepare skipped)`);
    return;
  }

  if (!(await runNuxiPrepare(cwd))) process.exitCode = 1;
}

function loadPaths(cwd: string) {
  return resolveAppPaths(cwd).catch((error: unknown) =>
    fail(`Could not load the app's nuxt.config: ${errorMessage(error)}`, {
      hint: "Fix nuxt.config.ts, or run nuxvel from the app's directory",
    }),
  );
}

async function modulePaths(app: AppPaths, module: string): Promise<AppPaths> {
  const layerDir = join(app.rootDir, "layers", kebabName(module, "billing"));
  requireFile(app.rootDir, join(layerDir, "nuxt.config.ts"), `Create it first: nuxvel make:module ${module}`);
  const layer = await loadPaths(layerDir);

  return {
    ...layer,
    pagesDir: join(layerDir, "app", "pages"),
    componentsDir: join(layerDir, "app", "components"),
    rootDir: app.rootDir,
    buildDir: app.buildDir,
    appServerDir: app.serverDir,
  };
}
