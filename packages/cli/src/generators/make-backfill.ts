import { type AppPaths, rootPathFrom } from "../app-layout/app-paths.ts";
import type { GeneratedFile } from "../generated/write-generated.ts";
import { toCamelCase } from "./case.ts";
import { definitionExport, definitionFile, domainName, dottedName, importFrom, kebabName, requireSchemaFile, schemaFile } from "./names.ts";

export function backfillFiles(name: string, table: string, paths: AppPaths, domain?: string): GeneratedFile[] {
  name = domainName(dottedName(name, "posts-content"), domain);
  kebabName(table, "posts");
  const tableFile = requireSchemaFile(paths, table, domain);

  const file = definitionFile(paths.serverDir, "database/backfills", name, "backfill", domain);
  const values = {
    name,
    exportName: definitionExport(name, "backfill"),
    tableCamelName: toCamelCase(table),
    tableImport: importFrom(file, tableFile),
    backfillsImport: importFrom(file, schemaFile(paths.appServerDir, "backfills")),
    rootPath: rootPathFrom(`${file}.ts`, paths.rootDir),
  };

  return [
    { path: `${file}.ts`, template: "backfill.ts.txt", values },
    { path: `${file}.test.ts`, template: "backfill-test.ts.txt", values },
  ];
}
