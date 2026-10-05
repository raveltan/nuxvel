import { type AppPaths, rootPathFrom } from "../app-layout/app-paths.ts";
import type { GeneratedFile } from "../generated/write-generated.ts";
import { definitionExport, definitionFile, domainName, dottedName } from "./names.ts";

export function channelFiles(name: string, paths: AppPaths, domain?: string): GeneratedFile[] {
  name = domainName(dottedName(name, "announcements"), domain);

  const file = definitionFile(paths.serverDir, "channels", name, "channel", domain);
  const values = { name, exportName: definitionExport(name, "channel"), rootPath: rootPathFrom(`${file}.ts`, paths.rootDir) };

  return [
    { path: `${file}.ts`, template: "channel.ts.txt", values },
    { path: `${file}.test.ts`, template: "channel-test.ts.txt", values },
  ];
}
