import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Alias } from "vite";

interface ServerTsconfig {
  compilerOptions: { paths: Record<string, string[]> };
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const APP_ALIAS = /^(#|~|@@|@\/)/;

/**
 * Reads the path aliases of `.nuxt/tsconfig.server.json`: `#nuxvel/*`,
 * `#server`, `#shared`, `~~`, `@@` and the rest of the server side. A
 * wildcard key maps a folder. `#imports` is left out because the runner
 * serves it.
 */
export function serverAliases(buildDir: string): Alias[] {
  const tsconfig: ServerTsconfig = JSON.parse(readFileSync(join(buildDir, "tsconfig.server.json"), "utf8"));

  return Object.entries(tsconfig.compilerOptions.paths).flatMap(([key, [target]]) => {
    if (!APP_ALIAS.test(key) || key === "#imports" || target === undefined) return [];

    return key.endsWith("/*")
      ? [{ find: new RegExp(`^${escape(key.slice(0, -2))}/(.*)$`), replacement: `${resolve(buildDir, target.slice(0, -2))}/$1` }]
      : [{ find: new RegExp(`^${escape(key)}$`), replacement: resolve(buildDir, target) }];
  });
}
