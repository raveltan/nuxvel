import { createResolver } from "@nuxt/kit";
import type { NamedFile } from "./named-files";

const discoveredEventsModule = createResolver(import.meta.url).resolve("./runtime/server/discovery/discovered-events");

/**
 * Builds `#nuxvel/events`: the event each discovered `server/events/`
 * file exports, named after the file's path.
 */
export function buildEventsModuleCode(definitions: NamedFile[]) {
  if (definitions.length === 0) return "export default [];";

  const imports = definitions.map(
    ({ file }, index) => `import * as events${index} from ${JSON.stringify(file)};`,
  );
  const modules = definitions.map(
    ({ file, name }, index) => `[events${index}, ${JSON.stringify(file)}, ${JSON.stringify(name)}]`,
  );

  return `import { discoveredEvents } from ${JSON.stringify(discoveredEventsModule)};
${imports.join("\n")}

export default discoveredEvents([${modules.join(", ")}]);
`;
}
