import { addImports, addServerImports, addTemplate } from "@nuxt/kit";
import { buildNamespaceModules } from "../definition-namespaces";
import type { DiscoveredFolder, Discovery } from "./discovery";
import type { GeneratedModule } from "./generated-modules";

export type Namespaces = Awaited<ReturnType<typeof registerNamespaces>>["namespaces"];

const NAMESPACE_ENTRIES: [namespace: string, kind: string, folder: DiscoveredFolder, define?: string][] = [
  ["$jobs", "job", "jobs"],
  ["$actions", "action", "actions"],
  ["$events", "event", "events"],
  ["$listeners", "listener", "listeners"],
  ["$mails", "mail", "mail"],
  ["$notifications", "notification", "notifications"],
  ["$channels", "channel", "channels"],
  ["$flags", "flag or experiment", "flags", "defineFlag"],
  ["$experiments", "flag or experiment", "flags", "defineExperiment"],
  ["$backfills", "backfill", "database/backfills"],
  ["$seeders", "seeder", "seeders"],
  ["$rateLimits", "rate limit", "rate-limits"],
  ["$policies", "policy", "policies"],
  ["$products", "product", "products"],
];

const EMPTY_MODULE = "export {};\n";

const EXPLICIT_IMPORT_NAMESPACES = ["$backfills", "$seeders"];

const CLIENT_NAMESPACES = ["$flags", "$experiments", "$channels", "$jobs"];

export async function registerNamespaces({ discoverNamed }: Discovery) {
  const namespaces = await Promise.all(
    NAMESPACE_ENTRIES.map(async ([namespace, kind, folder, define]) => {
      const root = `#nuxvel/${namespace.slice(1)}-namespace`;
      const build = async (buildRoot = root, stub = false, known?: Set<string>) =>
        buildNamespaceModules(buildRoot, folder, await discoverNamed(kind, folder), define, stub, known);
      if (!EXPLICIT_IMPORT_NAMESPACES.includes(namespace)) addServerImports([{ name: "*", as: namespace, from: root }]);
      const aliases = Object.keys(await build());
      const buildRegistered = (buildRoot = root, stub = false) =>
        build(buildRoot, stub, new Set(aliases.map((alias) => buildRoot + alias.slice(root.length))));

      return { namespace, root, folder, build, buildRegistered, aliases };
    }),
  );
  const namespaceModules: Record<string, GeneratedModule> = Object.fromEntries(
    namespaces.flatMap(({ buildRegistered, aliases }) =>
      aliases.map((alias): [string, GeneratedModule] => [alias, async () => (await buildRegistered())[alias] ?? EMPTY_MODULE]),
    ),
  );

  for (const { namespace, root, buildRegistered, aliases } of namespaces.filter(({ namespace }) => CLIENT_NAMESPACES.includes(namespace))) {
    const clientRoot = `#build/nuxvel/${namespace.slice(1)}-client-namespace`;
    for (const alias of aliases.map((serverAlias) => clientRoot + serverAlias.slice(root.length))) {
      const filename = alias.slice("#build/".length);
      addTemplate({ filename: `${filename}.mjs`, getContents: async () => (await buildRegistered(clientRoot, true))[alias] ?? EMPTY_MODULE });
      addTemplate({ filename: `${filename}.d.ts`, write: true, getContents: async () => (await buildRegistered(clientRoot))[alias] ?? EMPTY_MODULE });
    }
    addImports({ name: "*", as: namespace, from: clientRoot });
  }

  const testNamespaceList = namespaces.filter(({ namespace }) => namespace !== "$policies");
  for (const { namespace, root, buildRegistered, aliases } of testNamespaceList) {
    const testRoot = `./${namespace.slice(1)}`;
    const testModule = async (alias: string, stub: boolean) =>
      ((await buildRegistered(testRoot, stub))[alias] ?? EMPTY_MODULE).replace(/ from "(\.\/[^"]+)";/g, ' from "$1.mjs";');
    for (const alias of aliases.map((serverAlias) => testRoot + serverAlias.slice(root.length))) {
      const filename = `nuxvel/test-namespaces/${alias.slice(2)}`;
      addTemplate({ filename: `${filename}.mjs`, write: true, getContents: () => testModule(alias, true) });
      addTemplate({ filename: `${filename}.d.mts`, write: true, getContents: () => testModule(alias, false) });
    }
  }
  const testNamespaces = () =>
    testNamespaceList.map(({ namespace }) => `export * as ${namespace} from "./test-namespaces/${namespace.slice(1)}.mjs";\n`).join("");
  addTemplate({ filename: "nuxvel/test-namespaces.mjs", write: true, getContents: testNamespaces });
  addTemplate({ filename: "nuxvel/test-namespaces.d.mts", write: true, getContents: testNamespaces });

  return { namespaces, namespaceModules };
}
