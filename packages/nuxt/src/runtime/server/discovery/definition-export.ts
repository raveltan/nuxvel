/**
 * The definition a discovered module exports: its default export, or
 * else its one export of type `Definition` whose name ends with one of
 * `Suffix`.
 */
export type DefinitionExport<Module, Suffix extends string, Definition> = Module extends { default: infer Default }
  ? Default
  : Extract<Module[Extract<keyof Module, `${string}${Suffix}`>], Definition>;

/**
 * Picks the definition out of a discovered file's exports: the default
 * export or the named export whose name ends with the kind, e.g.
 * `postNotifySubscribersJob`, and whose value `isDefinition` accepts. A
 * suffixed export that is not a definition, e.g. a `previewMail`
 * helper, is ignored. The generated `#nuxvel/*` registries call it as
 * they load; `file` only names the file in errors.
 *
 * Throws when the file exports two different definitions this way.
 */
export function definitionExport<Module extends object, const Suffix extends string, Definition>(
  module: Module,
  suffixes: readonly Suffix[],
  isDefinition: (value: unknown) => value is Definition,
  file: string,
): DefinitionExport<Module, Suffix, Definition> {
  const definitions = new Set(
    Object.entries(module)
      .filter(
        ([key, value]) =>
          key === "default" || (suffixes.some((suffix) => key.endsWith(suffix)) && isDefinition(value)),
      )
      .map(([, value]) => value),
  );

  if (definitions.size > 1) {
    throw new Error(
      `nuxvel: ${file} exports ${definitions.size} definitions; export one, as the default export or as a named export whose name ends with ${suffixes.join(" or ")}`,
    );
  }

  const [definition] = definitions;

  // the value is the default or suffixed definition export, which is what DefinitionExport<> picks
  return definition as DefinitionExport<Module, Suffix, Definition>;
}
