import { readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { camelCase, definitionName, domainPatterns, exportSuffixes, namespaceLeaves } from "@nuxvel/nuxt/cli";
import { globSync } from "tinyglobby";
import type { Codemod } from "../codemod.ts";
import { ruleRewrite } from "../rule-rewrite.ts";
import { type ComponentImport, type DefinitionImport, type ExplicitImportsData, type TopicImport, explicitImports as rule } from "../rules/explicit-imports.ts";

interface PublicImport {
  name: string;
  kind: string;
  path: string;
}

const folders = "{server,app,shared,tests}/**/*.{ts,vue}";
const ignored = ["**/*.d.ts", "**/*.test.ts", "**/*.spec.ts"];

const NAMESPACES: [root: string, folder: string][] = [
  ["$jobs", "jobs"],
  ["$actions", "actions"],
  ["$mails", "mail"],
  ["$channels", "channels"],
  ["$events", "events"],
  ["$notifications", "notifications"],
  ["$listeners", "listeners"],
  ["$rateLimits", "rate-limits"],
  ["$policies", "policies"],
  ["$products", "products"],
  ["$seeders", "seeders"],
  ["$backfills", "database/backfills"],
];

const CLIENT_ROOTS: [root: string, folder: string][] = [
  ["$flags", "flags"],
  ["$experiments", "flags"],
  ["$channels", "channels"],
  ["$jobs", "jobs"],
];

const dataByApp = new Map<string, ExplicitImportsData>();
let entries: PublicImport[] | undefined;

function publicImports() {
  entries ??= JSON.parse(readFileSync(fileURLToPath(import.meta.resolve("@nuxvel/nuxt/public-imports.json")), "utf8")) as PublicImport[];

  return entries;
}

function publicTopics() {
  return new Map(publicImports().map(({ name, kind, path }) => [name, { kind: kind === "type" ? "type" : "value", path }] as const));
}

function componentTags() {
  return new Map(
    publicImports()
      .filter((entry) => entry.kind === "component")
      .map((entry) => [entry.name.replace(/-/g, "").toLowerCase(), { name: entry.name, path: entry.path } as ComponentImport] as const),
  );
}

function exportNames(source: string) {
  const declared = [...source.matchAll(/export\s+(?:async\s+)?(?:const|let|var|function|class|type|interface|enum)\s+([\w$]+)/g)].map(([, name]) => name ?? "");
  const listed = [...source.matchAll(/export\s*\{([^}]*)\}/g)].flatMap(([, list = ""]) =>
    list.split(",").map((entry) => entry.trim().split(/\s+as\s+/).pop() ?? ""),
  );

  return [...declared, ...listed].filter(Boolean);
}

function schemaExports(cwd: string) {
  const dir = join(cwd, "shared", "schemas");
  const exports = new Map<string, string[]>();

  for (const file of globSync(["**/*.ts"], { cwd: dir, absolute: true, ignore: ignored })) {
    const path = `#shared/schemas/${relative(dir, file).split(sep).join("/").replace(/\.ts$/, "")}`;
    for (const name of exportNames(readFileSync(file, "utf8"))) exports.set(name, [...(exports.get(name) ?? []), path]);
  }

  for (const paths of exports.values()) paths.sort();

  return exports;
}

function definitions(cwd: string, folder: string) {
  const server = join(cwd, "server");
  const files = globSync([`${folder}/**/*.ts`, ...domainPatterns(folder).map((pattern) => `domains/${pattern}`)], {
    cwd: server,
    absolute: true,
    ignore: ignored,
  });

  return files.map((file) => ({ file, name: definitionName(join(server, folder), file) }));
}

/** The definition each camelCase member of one `$<kind>` namespace reaches, by member path. */
export function namespaceDefinitions(cwd: string, folder: string) {
  const server = join(cwd, "server");
  const suffix = exportSuffixes(folder)[0] ?? "";
  const leaves = new Map<string, DefinitionImport>();

  for (const [key, leaf] of namespaceLeaves(folder, definitions(cwd, folder))) {
    const isDefault = leaf.name === "default";
    const name = isDefault ? `${camelCase(key.split(".").pop() ?? "")}${suffix}` : leaf.name;
    leaves.set(key, { path: `#server/${relative(server, leaf.file).split(sep).join("/").replace(/\.ts$/, "")}`, name, isDefault });
  }

  return leaves;
}

function clientNamespaces(cwd: string) {
  return new Map(
    CLIENT_ROOTS.map(([root, folder]) => {
      const names = new Map<string, string>();

      for (const key of namespaceLeaves(folder, definitions(cwd, folder)).keys()) {
        names.set(key, key.split(".").map((segment) => segment.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)).join("."));
      }

      return [root, names] as const;
    }),
  );
}

function appData(cwd: string): ExplicitImportsData {
  const cached = dataByApp.get(cwd);
  if (cached) return cached;
  const data = {
    topics: publicTopics(),
    namespaces: new Map(NAMESPACES.map(([root, folder]) => [root, namespaceDefinitions(cwd, folder)] as const)),
    schemas: schemaExports(cwd),
    components: componentTags(),
    clientNamespaces: clientNamespaces(cwd),
  };
  dataByApp.set(cwd, data);

  return data;
}

export const explicitImports: Codemod = {
  name: "explicit-imports",
  version: "0.3.0",
  description:
    'Imports each nuxvel name a file uses from its topic path, imports the nuxvel components a template renders, rewrites a $jobs.post.notifyFollowers member to the imported definition and a client $jobs.post.notifyFollowers to the string "post.notify-followers", imports a shared schema from "#shared/schemas/<file>", rewrites the removed subpaths to their topic path, and prints a name it cannot map as a manual step',
  files: [folders, `layers/*/${folders}`],
  rewrite(source, file, cwd) {
    const plugin = { meta: { name: "nuxvel-upgrade" }, rules: { "explicit-imports": rule(appData(cwd)) } };

    return ruleRewrite("explicit-imports", plugin)(source, file);
  },
};
