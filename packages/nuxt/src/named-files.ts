import { join, relative, sep } from "node:path";

/**
 * What discovery leaves out of every discovered folder: declaration
 * files and tests kept next to the code they cover.
 */
export const DISCOVERY_IGNORE = ["**/*.d.ts", "**/*.test.ts", "**/*.spec.ts"];

const NAME_PATTERN = /^[a-z0-9._-]+$/;

function suggestedName(name: string) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-");
}

/** A discovered definition file and the name its path gives it. */
export interface NamedFile {
  file: string;
  name: string;
}

/**
 * The files one layer's folder holds, in that layer's order. `module`
 * is the folder name of a layer in the app's `layers/`.
 */
export interface LayerFiles {
  dir: string;
  files: string[];
  module?: string;
}

/**
 * The kind suffixes of the definition files in each discovered folder:
 * `jobs/` holds `.job.ts` files.
 *
 * @internal Shared by the module's codegen and `@nuxvel/cli`.
 */
export const KIND_SUFFIXES: Record<string, string[]> = {
  actions: ["action"],
  jobs: ["job"],
  events: ["event"],
  listeners: ["listener"],
  mail: ["mail"],
  notifications: ["notification"],
  channels: ["channel"],
  flags: ["flag", "experiment"],
  schedules: ["schedule"],
  seeders: ["seeder"],
  "database/backfills": ["backfill"],
  webhooks: ["webhook"],
  products: ["product"],
  uploads: ["upload"],
  "rate-limits": ["rate-limit"],
  errors: ["classifier"],
  privacy: ["user-data"],
  policies: ["policy"],
  "database/schema": ["schema"],
  factories: ["factory"],
  "trpc/routers": ["router"],
};

const DOMAIN_FOLDERS: Record<string, string> = {
  actions: "actions",
  jobs: "jobs",
  events: "events",
  listeners: "listeners",
  mail: "mail",
  notifications: "notifications",
  channels: "channels",
  flags: "flags",
  schedules: "schedules",
  uploads: "uploads",
  "database/backfills": "backfills",
  "database/schema": "schema",
  factories: "factories",
  policies: "policies",
  "trpc/routers": "routers",
};

/**
 * The glob patterns, relative to `server/domains/`, of the definition
 * files of `folder` in domain folders: for `jobs`, each `.job.ts` file
 * under `<domain>/jobs/`.
 *
 * @internal Used by the module's discovery.
 */
export function domainPatterns(folder: string) {
  const domainFolder = DOMAIN_FOLDERS[folder];

  return domainFolder ? (KIND_SUFFIXES[folder] ?? []).map((suffix) => `*/${domainFolder}/**/*.${suffix}.ts`) : [];
}

/**
 * The endings of a named export that holds the definition of a file in
 * `folder`: the kind suffixes in PascalCase (`Job`, `RateLimit`).
 *
 * @internal Used by the generated `#nuxvel/*` registries.
 */
export function exportSuffixes(folder: string) {
  return (KIND_SUFFIXES[folder] ?? []).map((suffix) =>
    suffix.replace(/(^|-)([a-z])/g, (_, _dash: string, letter: string) => letter.toUpperCase()),
  );
}

function kindFolder(dir: string) {
  const path = dir.split(sep).join("/");

  return Object.keys(KIND_SUFFIXES).find((candidate) => path.endsWith(`/${candidate}`));
}

const DOMAIN_NAMED_FOLDERS = ["policies", "trpc/routers"];

/**
 * The path segments of `file` under the discovered folder `dir`. A file
 * in a domain folder gives its domain, then its path under the kind
 * folder: `domains/post/routers/comments.router.ts` under `trpc/routers`
 * is `["post", "comments.router.ts"]`. A policy or router file named
 * after its domain is the domain itself:
 * `domains/post/routers/post.router.ts` is `["post.router.ts"]`.
 *
 * @internal Used by the module's codegen.
 */
export function pathUnder(dir: string, folder: string | undefined, file: string) {
  const path = relative(dir, file).split(sep);
  if (path[0] !== ".." || !folder) return path;

  const [domain = "", , ...rest] = relative(join(dir.slice(0, -folder.length), "domains"), file).split(sep);
  const namedAfterDomain =
    DOMAIN_NAMED_FOLDERS.includes(folder) &&
    rest.length === 1 &&
    (KIND_SUFFIXES[folder] ?? []).some((suffix) => rest[0] === `${domain}.${suffix}.ts`);

  return namedAfterDomain ? rest : [domain, ...rest];
}

/**
 * The name a definition file's path under its folder gives it: the
 * segments joined with `.`, without `.ts` and without the kind suffix
 * of the folder (`post/notify-followers.job.ts` and
 * `post/notify-followers.ts` under `jobs/` are both
 * `post.notify-followers`). A file in a domain folder is named after
 * its domain, then its path under the kind folder:
 * `domains/post/jobs/notify-followers.job.ts` is `post.notify-followers`
 * too.
 *
 * @internal Shared by the module's codegen and `@nuxvel/cli`.
 */
export function definitionName(dir: string, file: string) {
  const folder = kindFolder(dir);
  const suffix = (folder ? (KIND_SUFFIXES[folder] ?? []) : []).find((kind) => file.endsWith(`.${kind}.ts`));
  const extension = suffix ? `.${suffix}.ts` : ".ts";
  const path = pathUnder(dir, folder, file).join(".");

  return path.endsWith(extension) ? path.slice(0, -extension.length) : path;
}

/**
 * Names every file of a folder across layers, `layers` in priority
 * order: a name a higher layer defines hides the same name in a lower
 * one, like Nuxt's own layer overrides. Throws when two files of one
 * layer, two files of the modules in the app's `layers/`, or a file and
 * one of nuxvel's `builtIns`, get the same name,
 * and when a name holds anything but `a-z`, `0-9`, `.`, `_` and `-`.
 * `kind` names the definition in those errors, e.g. `"job"`.
 */
export function nameFiles(kind: string, layers: LayerFiles[], builtIns: NamedFile[] = []): NamedFile[] {
  const builtInNames = new Set(builtIns.map(({ name }) => name));
  const byName = new Map<string, { file: string; layer: number }>();
  const moduleFiles = new Map<string, string>();

  layers.forEach(({ dir, files, module }, layer) => {
    for (const file of files) {
      const name = definitionName(dir, file);
      const existing = byName.get(name);

      if (!NAME_PATTERN.test(name)) {
        throw new Error(
          `nuxvel: ${file} is named "${name}", but a ${kind} name may only hold a-z, 0-9, ".", "_" and "-"; rename the file so the name is "${suggestedName(name)}"`,
        );
      }

      if (builtInNames.has(name)) {
        throw new Error(`nuxvel: ${file} is named "${name}", the name of nuxvel's built-in ${kind}; rename it`);
      }
      const clash = existing?.layer === layer ? existing.file : module ? moduleFiles.get(name) : undefined;
      if (clash) {
        throw new Error(`nuxvel: ${clash} and ${file} both name the ${kind} "${name}"; rename one of them`);
      }
      if (module) moduleFiles.set(name, file);
      if (!existing) byName.set(name, { file, layer });
    }
  });

  return [...[...byName].map(([name, { file }]) => ({ file, name })), ...builtIns];
}
