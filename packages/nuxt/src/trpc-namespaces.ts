import { dirname, relative, sep } from "node:path";
import { camelCase } from "./definition-namespaces";
import { type LayerFiles, pathUnder } from "./named-files";

interface TrpcRouterFile {
  file: string;
  path: string;
  segments: string[];
}

type NamespaceClaim = { file: string; path: string; isRouter: boolean; layer: number };

function clashingClaim(claims: Map<string, NamespaceClaim>, segments: string[]) {
  for (let depth = 0; depth < segments.length; depth++) {
    const namespace = segments.slice(0, depth + 1).join(".");
    const existing = claims.get(namespace);

    if (existing && (depth === segments.length - 1 || existing.isRouter)) return { namespace, existing };
  }

  return undefined;
}

function claim(claims: Map<string, NamespaceClaim>, segments: string[], file: string, path: string, layer: number) {
  segments.forEach((_, depth) => {
    const namespace = segments.slice(0, depth + 1).join(".");
    if (!claims.has(namespace)) claims.set(namespace, { file, path, isRouter: depth === segments.length - 1, layer });
  });
}

/**
 * Maps router files under each layer's `server/trpc/routers` to their
 * namespaces: one segment per folder and file name, kebab-case
 * camel-cased, `index` kept (`admin/index.ts` is `admin.index`), the
 * `.router.ts` suffix dropped (`task.router.ts` is `task`). A router
 * in `server/domains/<domain>/routers/` gets the domain, then its path
 * under `routers/`.
 * `layers` come in priority order, and a namespace a higher layer
 * defines hides the lower layers' routers on it, like Nuxt's own layer
 * overrides.
 *
 * Throws when two files of one layer, or a file and a folder, map to
 * the same namespace, naming both. The same holds across the modules
 * in the app's `layers/`: a module does not hide another module.
 */
export function trpcRouterFiles(layers: LayerFiles[]): TrpcRouterFile[] {
  const claims = new Map<string, NamespaceClaim>();
  const moduleClaims = new Map<string, NamespaceClaim>();
  const routers: TrpcRouterFile[] = [];

  layers.forEach(({ dir, files, module }, layer) => {
    for (const file of files) {
      const path = relative(dirname(dirname(dir)), file).split(sep).join("/");
      const segments = pathUnder(dir, "trpc/routers", file)
        .join("/")
        .replace(/(\.router)?\.ts$/, "")
        .split("/")
        .map(camelCase);
      const clash = clashingClaim(claims, segments);
      const moduleClash = module ? clashingClaim(moduleClaims, segments) : undefined;

      if (clash?.existing.layer === layer) {
        throw new Error(
          `nuxvel: server/${clash.existing.path} and server/${path} both define the tRPC namespace "${clash.namespace}"; rename one of them`,
        );
      }
      if (moduleClash) {
        throw new Error(
          `nuxvel: ${moduleClash.existing.file} and ${file} both define the tRPC namespace "${moduleClash.namespace}"; rename one of them`,
        );
      }
      if (module) claim(moduleClaims, segments, file, path, layer);
      if (clash) continue;

      claim(claims, segments, file, path, layer);
      routers.push({ file, path, segments });
    }
  });

  return routers;
}
