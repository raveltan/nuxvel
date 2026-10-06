import { createResolver } from "@nuxt/kit";
import { type KeyTree, mountedActions, routerKeys } from "./mounted-actions";
import type { LayerFiles, NamedFile } from "./named-files";
import { trpcRouterFiles } from "./trpc-namespaces";

const resolver = createResolver(import.meta.url);
const definitionExportModule = resolver.resolve("./runtime/server/discovery/definition-export");
const isRouterModule = resolver.resolve("./runtime/server/trpc/is-router");
const mountActionsModule = resolver.resolve("./runtime/server/trpc/mount-actions");

type RouterNode = string | RouterTree;
type RouterTree = { [key: string]: RouterNode };

function childTree(tree: RouterTree, key: string, file: string): RouterTree {
  const child = (tree[key] ??= {});
  if (typeof child === "string") throw new Error(`nuxvel: ${file} nests under the procedure ${key}`);

  return child;
}

function renderNode(node: RouterNode, mounts: Map<string, { file: string; node: RouterTree }>): string {
  if (typeof node === "string") {
    const mounted = mounts.get(node);
    return mounted ? `mountActions(${node}, ${renderNode(mounted.node, mounts)}, ${JSON.stringify(mounted.file)})` : node;
  }

  return `{ ${Object.entries(node)
    .map(([key, value]) => `${key}: ${renderNode(value, mounts)}`)
    .join(", ")} }`;
}

function hasPath(keys: KeyTree | undefined, path: string[]): boolean {
  const [segment, ...rest] = path;
  if (!keys || segment === undefined || !keys.has(segment)) return false;
  const child = keys.get(segment);

  return rest.length === 0 || child === undefined || hasPath(child, rest);
}

function clash(routerFile: string, actionFile: string, path: string[]) {
  return new Error(
    `nuxvel: ${routerFile} and ${actionFile} both define the tRPC procedure "${path.join(".")}"; rename the router key or the action, or drop the action's procedure`,
  );
}

/**
 * Builds `#nuxvel/trpc-routers`: the discovered router files, nested by
 * their path under their layer's `server/trpc/routers` with kebab-case segments
 * camel-cased, and, as `routerFiles`, each namespace's file for
 * `nuxvel routes`. A file exports its router as the default export or
 * as a named export whose name ends with `Router` (`taskRouter`).
 * A higher layer's namespace hides a lower one's; see
 * {@link trpcRouterFiles}. Each action whose `defineAction()` sets
 * `procedure` is mounted at its path (`posts.update-post` at
 * `posts.updatePost`), in the router of that namespace when there is
 * one. Throws, naming both files, when a router file or a key of its
 * exported object literal is already at that path.
 */
export function buildTrpcRoutersModuleCode(layers: LayerFiles[], actions: NamedFile[] = []) {
  const routers = trpcRouterFiles(layers);
  const mounted = mountedActions(actions);

  if (routers.length === 0 && mounted.length === 0) return "export default {};\nexport const routerFiles = {};\n";

  const imports: string[] = [];
  const root: { [key: string]: RouterNode } = {};
  const routerFiles: Record<string, string> = {};
  const routerFileById = new Map<string, string>();
  const mounts = new Map<string, { file: string; node: RouterTree }>();
  const actionFiles = new Map<string, string>();

  routers.forEach(({ file, segments }, index) => {
    const identifier = `router${index}`;
    imports.push(
      `import * as ${identifier}Module from ${JSON.stringify(file)};`,
      `const ${identifier} = definitionExport(${identifier}Module, ["Router"], isRouter, ${JSON.stringify(file)});`,
    );
    routerFiles[segments.join(".")] = file;
    routerFileById.set(identifier, file);

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

  mounted.forEach(({ file, exportName, segments }, index) => {
    const leaf = `mountAction(action${index})`;
    const path = segments.join(".");
    const sameAction = actionFiles.get(path);
    if (sameAction) throw new Error(`nuxvel: ${sameAction} and ${file} are both mounted at the tRPC procedure "${path}"; rename one of them`);
    actionFiles.set(path, file);
    imports.push(`import { ${exportName} as action${index} } from ${JSON.stringify(file)};`);
    routerFiles[path] = file;

    let node = root;
    for (const [depth, segment] of segments.entries()) {
      const existing = node[segment];
      const routerFile = typeof existing === "string" ? routerFileById.get(existing) : undefined;
      const rest = segments.slice(depth + 1);

      if (typeof existing === "string" && routerFile && rest.length > 0) {
        if (hasPath(routerKeys(routerFile), rest)) throw clash(routerFile, file, segments);
        const mount = mounts.get(existing) ?? { file: routerFile, node: {} };
        mounts.set(existing, mount);
        let target = mount.node;
        for (const key of rest.slice(0, -1)) target = childTree(target, key, file);
        target[rest.at(-1) ?? segment] = leaf;
        return;
      }
      if (existing !== undefined && rest.length === 0) {
        const namespace = segments.join(".");
        const router = routers.find((candidate) => `${candidate.segments.join(".")}.`.startsWith(`${namespace}.`));
        throw clash(router?.file ?? "", file, segments);
      }
      if (rest.length === 0) node[segment] = leaf;
      else node = childTree(node, segment, file);
    }
  });

  const actionHeader = mounted.length > 0 ? `import { mountAction, mountActions } from ${JSON.stringify(mountActionsModule)};\n` : "";
  const header = `${actionHeader}import { definitionExport } from ${JSON.stringify(definitionExportModule)};\nimport { isRouter } from ${JSON.stringify(isRouterModule)};\n`;

  return `${header}${imports.join("\n")}\n\nexport default ${renderNode(root, mounts)};\n\nexport const routerFiles = ${JSON.stringify(routerFiles)};\n`;
}
