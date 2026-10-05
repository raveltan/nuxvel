import { existsSync } from "node:fs";
import { type AppPaths, rootPathFrom } from "../app-layout/app-paths.ts";
import type { GeneratedFile } from "../generated/write-generated.ts";
import { inputFieldValues } from "./fields.ts";
import { definitionExport, definitionFile, domainName, dottedName } from "./names.ts";

export function eventFile(paths: AppPaths, eventName: string) {
  const inDomain = definitionFile(paths.serverDir, "events", eventName, "event", eventName.split(".")[0]);

  return existsSync(`${inDomain}.ts`) ? inDomain : definitionFile(paths.serverDir, "events", eventName, "event");
}

export function eventFiles(name: string, paths: AppPaths, domain?: string, input = inputFieldValues([], "json")): GeneratedFile[] {
  name = domainName(dottedName(name, "post.published"), domain);

  const file = definitionFile(paths.serverDir, "events", name, "event", domain);
  const values = {
    name,
    exportName: definitionExport(name, "event"),
    rootPath: rootPathFrom(`${file}.ts`, paths.rootDir),
    ...input,
  };

  return [
    { path: `${file}.ts`, template: "event.ts.txt", values },
    { path: `${file}.test.ts`, template: "event-test.ts.txt", values },
  ];
}
