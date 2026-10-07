import { readFileSync } from "node:fs";
import type { NamedFile } from "./named-files";

/**
 * Builds a `#nuxvel/*-names` module: the union of the names the discovered
 * files give, with no import of the files, so a program that reads the
 * type does not load them. With `skipRenamed`, a file that exports a
 * `renamed()` alias leaves its old name out.
 */
export function buildNamesModuleCode(typeName: string, definitions: NamedFile[], skipRenamed = false) {
  const names = definitions
    .filter(({ file }) => !skipRenamed || !/\brenamed\(/.test(readFileSync(file, "utf8")))
    .map(({ name }) => JSON.stringify(name));

  return `export type ${typeName} = ${names.length === 0 ? "never" : names.join(" | ")};\n`;
}
