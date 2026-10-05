import type { AppPaths } from "../app-layout/app-paths.ts";
import type { GeneratedFile } from "../generated/write-generated.ts";
import { definitionExport, definitionFile, domainName, dottedName } from "./names.ts";

export function flagFiles(name: string, paths: AppPaths, kind: "flag" | "experiment", domain?: string): GeneratedFile[] {
  name = domainName(dottedName(name, "new-checkout"), domain);

  return [
    {
      path: `${definitionFile(paths.serverDir, "flags", name, kind, domain)}.ts`,
      template: `${kind}.ts.txt`,
      values: { exportName: definitionExport(name, kind) },
    },
  ];
}
