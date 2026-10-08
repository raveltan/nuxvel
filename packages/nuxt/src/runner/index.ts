import { readFileSync, realpathSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vue from "@vitejs/plugin-vue";
import type { NitroRuntimeConfig } from "nitropack/types";
import { createServer, createServerModuleRunner } from "vite";
import { serverAliases } from "./aliases";
import { importsPlugin } from "./imports";
import type { RunnerNitroApp, startShim } from "./nitro-shim";

export type { RunnerNitroApp } from "./nitro-shim";

/** Options of {@link loadApp}. */
export interface LoadAppOptions {
  /** The root folder of the app. `nuxt prepare` must have run in it. */
  rootDir: string;
  /**
   * The names of the server plugins to run after `validate-env` and
   * `load-registries`, as in `.nuxt/nuxvel/server-plugins.json`, for
   * example `worker`. Each runs in that file's order. Default:
   * `["close-connections"]`, which `close()` needs to end the connections.
   */
  plugins?: string[];
}

/** What a function given to {@link LoadedApp.run} receives. */
export interface AppScope {
  /** The Nitro app of the runner. */
  nitroApp: RunnerNitroApp;
  /**
   * Loads a module through the runner and resolves to its exports. Use it
   * for every module of the app or of the framework that the function
   * touches: a module loaded another way is a second copy, with its own
   * registries.
   */
  load<Module extends object>(id: string): Promise<Module>;
}

/** An app that {@link loadApp} has loaded. */
export interface LoadedApp {
  /** The Nitro app of the runner: its hooks and `captureError`. */
  nitroApp: RunnerNitroApp;
  /** Runs `fn` against the loaded app and resolves to what it returns. */
  run<Result>(fn: (scope: AppScope) => Result | Promise<Result>): Promise<Result>;
  /** Calls the `close` hook, which ends the connections, then stops the runner. */
  close(): Promise<void>;
}

const BOOT_PLUGINS = ["validate-env", "load-registries"];
const shimFile = fileURLToPath(new URL("./nitro-shim", import.meta.url));

function readJson<Data>(file: string): Data {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`nuxvel: cannot read ${file}. Run \`nuxt prepare\` in the app first.`, { cause: error });
  }
}

/**
 * Loads the server code of a prepared app in this process, with no build.
 *
 * It starts a Vite module runner with the Vue plugin (for `.vue` mail
 * templates), Nitro's auto-imports (h3, the app's `server/utils/`) and the
 * path aliases of `.nuxt/tsconfig.server.json`. A small shim stands in for
 * Nitro's runtime: `useRuntimeConfig` (the file `.nuxt/nuxvel/runtime-config.json`
 * with the `NUXT_*` variables applied), `useNitroApp`, `useStorage`,
 * `useEvent`, `defineNitroPlugin`, `defineTask` and `runTask`. The shim
 * serves no request, so `useEvent()` throws. It then runs the
 * `validate-env` and `load-registries` plugins, which name every
 * definition, and the plugins in {@link LoadAppOptions.plugins}.
 *
 * `import.meta.dev` is `false`, as in a build. The caller handles signals.
 *
 * @param options See {@link LoadAppOptions}.
 *
 * @example
 * ```ts
 * const app = await loadApp({ rootDir: process.cwd() });
 * const note = await app.run(async ({ load }) => {
 *   const { addNoteAction } = await load<typeof import("./server/actions/notes/add-note.action")>("~~/server/actions/notes/add-note.action");
 *   const { systemActor } = await load<typeof import("@nuxvel/nuxt/server/actions")>("@nuxvel/nuxt/server/actions");
 *   return addNoteAction({ name: "hello" }, { actor: systemActor("script") });
 * });
 * await app.close();
 * ```
 */
export async function loadApp({ rootDir, plugins = ["close-connections"] }: LoadAppOptions): Promise<LoadedApp> {
  const root = realpathSync(resolve(rootDir));
  const buildDir = join(root, ".nuxt");
  const nuxvelDir = join(buildDir, "nuxvel");
  const runtimeConfig = readJson<NitroRuntimeConfig>(join(nuxvelDir, "runtime-config.json"));
  const pluginFiles = readJson<string[]>(join(nuxvelDir, "server-plugins.json"));
  const tasks = readJson<Record<string, string>>(join(nuxvelDir, "tasks.json"));
  const named = (name: string) => {
    const file = pluginFiles.find((candidate) => basename(candidate) === name);

    if (file === undefined) throw new Error(`nuxvel: no server plugin named "${name}" in .nuxt/nuxvel/server-plugins.json`);

    return file;
  };
  const bootFiles = [...BOOT_PLUGINS, ...plugins.filter((name) => !BOOT_PLUGINS.includes(name))].map(named);

  const server = await createServer({
    root,
    configFile: false,
    envDir: false,
    appType: "custom",
    logLevel: "warn",
    clearScreen: false,
    server: { middlewareMode: true, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true },
    ssr: { noExternal: [/^@nuxvel\//, "trpc-nuxt"] },
    define: { "import.meta.dev": false, "import.meta.prerender": false, "import.meta.server": true, "import.meta.client": false },
    resolve: { alias: [{ find: /^nitropack\/runtime$/, replacement: shimFile }, ...serverAliases(buildDir)] },
    plugins: [vue(), await importsPlugin(root, shimFile)],
  });
  const runner = createServerModuleRunner(server.environments.ssr, { hmr: false });
  const load = <Module extends object>(id: string): Promise<Module> => runner.import(id);

  try {
    const shim = await load<{ startShim: typeof startShim }>(shimFile);
    const nitroApp = shim.startShim(runtimeConfig, tasks);

    for (const file of bootFiles) {
      const plugin = await load<{ default: (app: RunnerNitroApp) => void | Promise<void> }>(file);

      await plugin.default(nitroApp);
    }

    return {
      nitroApp,
      run: async (fn) => fn({ nitroApp, load }),
      close: async () => {
        await nitroApp.hooks.callHook("close");
        await runner.close();
        await server.close();
      },
    };
  } catch (error) {
    await runner.close();
    await server.close();
    throw error;
  }
}
