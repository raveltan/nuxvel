import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const IMPORTS_FRAMEWORK_SOURCE = /(?:import\(|from |path=)["'][^"']*packages\/nuxt\/src\//;

export function typeFilesImportingSource(buildDir: string) {
  return readdirSync(buildDir, { recursive: true, encoding: "utf8" })
    .filter((file) => /\.d\.m?ts$/.test(file) || /^nuxvel\/[^/]+\.ts$/.test(file) || /^tsconfig.*\.json$/.test(file))
    .filter((file) => IMPORTS_FRAMEWORK_SOURCE.test(readFileSync(join(buildDir, file), "utf8")));
}
