import type { AppPaths } from "../app-layout/app-paths.ts";
import type { GeneratedFile } from "../generated/write-generated.ts";
import { definitionExport, definitionFile, domainName, dottedName } from "./names.ts";

export function scheduleFiles(name: string, paths: AppPaths, domain?: string): GeneratedFile[] {
  name = domainName(dottedName(name, "posts.prune-drafts"), domain);

  return [
    {
      path: `${definitionFile(paths.serverDir, "schedules", name, "schedule", domain)}.ts`,
      template: "schedule.ts.txt",
      values: { name, exportName: definitionExport(name, "schedule") },
    },
  ];
}
