import { existsSync, readFileSync } from "node:fs";
import { type AppPaths, rootPathFrom } from "../app-layout/app-paths.ts";
import { loadAppLayout } from "../app-layout/load-app-layout.ts";
import { nameIn } from "../events/list-events.ts";
import type { GeneratedFile } from "../generated/write-generated.ts";
import { eventFile } from "./make-event.ts";
import { definitionExport, definitionFile, domainName, dottedName, importFrom, requireFile } from "./names.ts";

function eventSample(event: string, eventPath: string) {
  const test = `${eventPath}.test.ts`;
  const source = existsSync(test) ? readFileSync(test, "utf8") : "";

  return source.match(new RegExp(`emit\\("${event.replaceAll(".", "\\.")}", ([\\s\\S]*?)\\);\\n`))?.[1] ?? "{}";
}

async function findEventFile(paths: AppPaths, event: string) {
  const local = eventFile(paths, event);

  if (existsSync(`${local}.ts`)) return local;

  const layout = await loadAppLayout(paths.rootDir, ["events"]);
  const found = (layout.files.events ?? []).find((file) => nameIn(layout, "events", file) === event);

  return found ? found.replace(/\.ts$/, "") : local;
}

export async function listenerFiles(name: string, event: string, paths: AppPaths, domain?: string): Promise<GeneratedFile[]> {
  name = domainName(dottedName(name, "post.notify-subscribers"), domain);
  event = dottedName(event, "post.published");
  const eventPath = await findEventFile(paths, event);
  requireFile(
    paths.rootDir,
    `${eventPath}.ts`,
    `Create the event first: nuxvel make:event ${event}`,
  );

  const file = definitionFile(paths.serverDir, "listeners", name, "listener", domain);
  const values = {
    name,
    exportName: definitionExport(name, "listener"),
    eventName: event,
    eventImport: importFrom(file, eventPath),
    eventExportName: definitionExport(event, "event"),
    sample: eventSample(event, eventPath),
    rootPath: rootPathFrom(`${file}.ts`, paths.rootDir),
  };

  return [
    { path: `${file}.ts`, template: "listener.ts.txt", values },
    { path: `${file}.test.ts`, template: "listener-test.ts.txt", values },
  ];
}
