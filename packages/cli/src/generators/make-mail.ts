import { dirname, join } from "node:path";
import { type AppPaths, rootPathFrom } from "../app-layout/app-paths.ts";
import type { GeneratedFile } from "../generated/write-generated.ts";
import { toPascalCase, toSentenceCase } from "./case.ts";
import { definitionExport, definitionFile, domainName, dottedName } from "./names.ts";

export function mailFiles(name: string, paths: AppPaths, domain?: string): GeneratedFile[] {
  name = domainName(dottedName(name, "order-shipped"), domain);

  const file = definitionFile(paths.serverDir, "mail", name, "mail", domain);
  const values = {
    name,
    exportName: definitionExport(name, "mail"),
    pascalName: toPascalCase(name),
    title: toSentenceCase(name),
    rootPath: rootPathFrom(`${file}.ts`, paths.rootDir),
  };

  return [
    { path: `${file}.ts`, template: "mail.ts.txt", values },
    { path: join(dirname(file), "templates", `${values.pascalName}.vue`), template: "mail-template.vue.txt", values },
    { path: `${file}.test.ts`, template: "mail-test.ts.txt", values },
  ];
}
