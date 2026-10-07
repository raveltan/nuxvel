import { readFileSync } from "node:fs";
import { exportSuffixes, type NamedFile } from "./named-files";

/**
 * The key of one name segment in a generated `$<kind>` namespace: the
 * segment in camelCase (`notify-subscribers` is `notifySubscribers`).
 *
 * @internal Shared by the module's codegen and `@nuxvel/cli`.
 */
export function camelCase(segment: string) {
  return segment.replace(/-([a-z0-9])/g, (_, letter: string) => letter.toUpperCase());
}

function definitionExport(file: string, suffixes: string[]) {
  const exported = [
    ...readFileSync(file, "utf8").matchAll(/export\s+(?:default|const\s+([\w$]+)[^=]*=)\s*([\w$]*)/g),
  ].map(([, name = "default", call = ""]) => ({ name, call }));

  return (
    exported.find(({ name }) => suffixes.some((suffix) => name.endsWith(suffix))) ??
    exported.find(({ name }) => name === "default") ??
    exported.find(({ call }) => call.startsWith("define")) ?? { name: "default", call: "" }
  );
}

/** One definition a generated `$<kind>` namespace reaches: the file that holds it and the name that file exports it under. */
export interface NamespaceLeaf {
  file: string;
  name: string;
}

/**
 * Maps the path of each definition in `definitions` to its file and its
 * export name. The key is the definition name in camelCase
 * (`post.notify-followers` is `post.notifyFollowers`), which is the path
 * under the `$<kind>` namespace root (`$jobs.post.notifyFollowers`).
 *
 * Use it to rewrite a namespace member to the imported definition. A file
 * whose definition is a `renamed()` alias gets no entry, and with `define`
 * a file whose definition comes from another call gets none either. A file
 * that default-exports its definition has the name `"default"`.
 *
 * @internal Shared by the module's codegen and `@nuxvel/cli`.
 */
export function namespaceLeaves(folder: string, definitions: NamedFile[], define?: string) {
  const suffixes = exportSuffixes(folder);

  return new Map(
    definitions.flatMap(({ file, name }): [string, NamespaceLeaf][] => {
      const definition = definitionExport(file, suffixes);
      if (definition.call === "renamed" || (define && definition.call !== define)) return [];

      return [[name.split(".").map(camelCase).join("."), { file, name: definition.name }]];
    }),
  );
}

/**
 * Builds the modules of a generated `$<kind>` namespace such as `$jobs`:
 * one module for `root` and one for each folder under it, keyed by
 * alias (`#nuxvel/jobs-namespace.post`). Each key is a camelCase name
 * segment, and each leaf re-exports the definition from its file, so
 * go-to-definition on `$jobs.post.notifySubscribers` opens the file.
 * A file that exports a `renamed()` alias gets no key, and with `define`
 * a file whose definition comes from another call gets none either
 * (`$flags` and `$experiments` share `flags/`). Throws when one
 * key is both a definition and a folder. With `stub`, each leaf is only
 * `{ name }`, so the app can load it without the server definition.
 * With `known`, a definition under a folder alias outside that set gets
 * no key, so no module imports an alias that was never registered.
 */
export function buildNamespaceModules(
  root: string,
  folder: string,
  definitions: NamedFile[],
  define?: string,
  stub = false,
  known?: Set<string>,
) {
  const suffixes = exportSuffixes(folder);
  const modules = new Map<string, string[]>([[root, []]]);
  const leaves = new Map<string, string>();

  for (const { file, name } of definitions) {
    const definition = definitionExport(file, suffixes);
    if (definition.call === "renamed" || (define && definition.call !== define)) continue;

    const keys = name.split(".").map(camelCase);
    const leaf = keys.pop() ?? name;
    if (known && keys.some((_, index) => !known.has([root, ...keys.slice(0, index + 1)].join(".")))) continue;
    let parent = root;

    for (const key of keys) {
      const alias = `${parent}.${key}`;
      const clash = leaves.get(alias);

      if (clash) throw new Error(`nuxvel: ${clash} and the folder of ${file} both give the key ${key}; rename one of them`);
      if (!modules.has(alias)) {
        modules.set(alias, []);
        modules.get(parent)?.push(`export * as ${key} from ${JSON.stringify(alias)};`);
      }
      parent = alias;
    }

    if (modules.has(`${parent}.${leaf}`)) {
      throw new Error(`nuxvel: ${file} and a folder next to it both give the key ${leaf}; rename one of them`);
    }
    leaves.set(`${parent}.${leaf}`, file);
    modules.get(parent)?.push(
      stub
        ? `export const ${leaf} = { name: ${JSON.stringify(name)} };`
        : `export { ${definition.name} as ${leaf} } from ${JSON.stringify(file)};`,
    );
  }

  return Object.fromEntries([...modules].map(([alias, lines]) => [alias, `${lines.join("\n")}\nexport {};\n`]));
}
