import { type AppPaths, rootPathFrom } from "../app-layout/app-paths.ts";
import type { GeneratedFile } from "../generated/write-generated.ts";
import { toSnakeCase } from "./case.ts";
import { definitionExport, definitionFile, dottedName } from "./names.ts";

export function webhookFiles(name: string, paths: AppPaths): GeneratedFile[] {
  name = dottedName(name, "billing");

  const file = definitionFile(paths.serverDir, "webhooks", name, "webhook");
  const values = {
    name,
    exportName: definitionExport(name, "webhook"),
    secretName: `NUXT_${toSnakeCase(name).toUpperCase()}_WEBHOOK_SECRET`,
    rootPath: rootPathFrom(`${file}.ts`, paths.rootDir),
  };

  return [
    { path: `${file}.ts`, template: "webhook.ts.txt", values },
    { path: `${file}.test.ts`, template: "webhook-test.ts.txt", values },
  ];
}
