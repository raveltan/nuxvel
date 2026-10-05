import type { AppPaths } from "../app-layout/app-paths.ts";
import type { GeneratedFile } from "../generated/write-generated.ts";
import { toCamelCase } from "./case.ts";
import { definitionExport, domainFile, importFrom, kebabName, requireSchemaFile } from "./names.ts";

export function factoryFiles(table: string, paths: AppPaths, domain?: string): GeneratedFile[] {
  kebabName(table, "posts");

  const file = domainFile(paths.serverDir, "factories", table, "factory", domain);
  const values = {
    name: table,
    camelName: toCamelCase(table),
    exportName: definitionExport(table, "factory"),
    schemaImport: importFrom(file, requireSchemaFile(paths, table, domain)),
  };

  return [
    { path: `${file}.ts`, template: "factory.ts.txt", values },
    { path: `${file}.test.ts`, template: "factory-test.ts.txt", values },
  ];
}
