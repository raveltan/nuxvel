import { createResolver } from "@nuxt/kit";
import type { LayerFiles } from "./named-files";
import { trpcRouterFiles } from "./trpc-namespaces";

const resolver = createResolver(import.meta.url);
const definitionExportModule = resolver.resolve("./runtime/server/discovery/definition-export");
const isRouterModule = resolver.resolve("./runtime/server/trpc/is-router");

type RouterNode = string | { [key: string]: RouterNode };

function renderNode(node: RouterNode): string {
  if (typeof node === "string") return node;

  return `{ ${Object.entries(node)
    .map(([key, value]) => `${key}: ${renderNode(value)}`)
    .join(", ")} }`;
}

/**
 * Builds `#nuxvel/trpc-routers`: the discovered router files, nested by
 * their path under their layer's `server/trpc/routers` with kebab-case segments
 * camel-cased, and, as `routerFiles`, each namespace's file for
 * `nuxvel routes`. A file exports its router as the default export or
 * as a named export whose name ends with `Router` (`taskRouter`).
 * A higher layer's namespace hides a lower one's; see
 * {@link trpcRouterFiles}.
 */
export function buildTrpcRoutersModuleCode(layers: LayerFiles[]) {
  const routers = trpcRouterFiles(layers);

  if (routers.length === 0) return "export default {};\nexport const routerFiles = {};\n";

  const imports: string[] = [];
  const root: { [key: string]: RouterNode } = {};
  const routerFiles: Record<string, string> = {};

  routers.forEach(({ file, segments }, index) => {
    const identifier = `router${index}`;
    imports.push(
      `import * as ${identifier}Module from ${JSON.stringify(file)};`,
      `const ${identifier} = definitionExport(${identifier}Module, ["Router"], isRouter, ${JSON.stringify(file)});`,
    );
    routerFiles[segments.join(".")] = file;

    let node = root;
    segments.forEach((segment, depth) => {
      if (depth === segments.length - 1) {
        node[segment] = identifier;
      } else {
        const child = (node[segment] ??= {});
        if (typeof child === "string") throw new Error(`nuxvel: ${file} nests under the router file ${segment}`);
        node = child;
      }
    });
  });

  const header = `import { definitionExport } from ${JSON.stringify(definitionExportModule)};\nimport { isRouter } from ${JSON.stringify(isRouterModule)};\n`;

  return `${header}${imports.join("\n")}\n\nexport default ${renderNode(root)};\n\nexport const routerFiles = ${JSON.stringify(routerFiles)};\n`;
}
