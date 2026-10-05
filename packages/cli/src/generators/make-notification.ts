import type { AppPaths } from "../app-layout/app-paths.ts";
import type { GeneratedFile } from "../generated/write-generated.ts";
import { toSentenceCase } from "./case.ts";
import { definitionExport, definitionFile, domainName, dottedName, importFrom, schemaFile } from "./names.ts";

export function notificationFiles(name: string, paths: AppPaths, domain?: string): GeneratedFile[] {
  name = domainName(dottedName(name, "post.published"), domain);

  const file = definitionFile(paths.serverDir, "notifications", name, "notification", domain);
  const values = {
    name,
    exportName: definitionExport(name, "notification"),
    title: toSentenceCase(name),
    authSchemaPath: importFrom(file, schemaFile(paths.appServerDir, "auth")),
  };

  return [
    { path: `${file}.ts`, template: "notification.ts.txt", values },
    { path: `${file}.test.ts`, template: "notification-test.ts.txt", values },
  ];
}
