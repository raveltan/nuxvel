const NAME_KEY = Symbol.for("nuxvel.nameKey");
const NAMED_BY = Symbol.for("nuxvel.namedBy");

/**
 * A definition named `Name`: what the generated `#nuxvel/*` registries
 * hold. An action keeps its name as `actionName`, everything else as
 * `name`.
 */
export type Named<Definition, Name extends string> = Definition extends { readonly actionName: string }
  ? Definition & { readonly actionName: Name }
  : Definition & { readonly name: Name };

/** Whether `value` is a definition from a nuxvel `defineX()` call. */
export function isDefinition(value: unknown): value is object {
  return (typeof value === "object" || typeof value === "function") && value !== null && Object.hasOwn(value, NAME_KEY);
}

/**
 * Marks a fresh definition as named by the file it lives in: reading
 * `key` throws until the generated registry calls {@link named} on it.
 * Until then the property stays out of spreads, `JSON.stringify` and
 * printing.
 */
export function awaitingName<Definition extends object>(definition: Definition, kind: string, key = "name"): Definition {
  Object.defineProperty(definition, NAME_KEY, { value: key, configurable: true });
  Object.defineProperty(definition, key, {
    configurable: true,
    enumerable: false,
    get() {
      throw new Error(
        `nuxvel: this ${kind} has no name yet. It is named after its file's path under its server/ folder once the app loads that folder, so define it there and read its name while the app runs, not while modules load.`,
      );
    },
  });

  return definition;
}

/**
 * Gives a discovered definition the name its path under its folder
 * produces. The generated `#nuxvel/*` registries call it as they load;
 * `file` only names the file in errors.
 *
 * Throws when `file` does not export a nuxvel definition, or exports
 * one another file already exports (naming that file).
 */
export function named<Definition, const Name extends string>(
  definition: Definition,
  name: Name,
  file: string,
): Named<Definition, Name> {
  if (!isDefinition(definition)) {
    throw new Error(
      `nuxvel: ${file} does not export a nuxvel definition; export the one its defineX() call returns, or renamed(definition) to keep an old name`,
    );
  }

  const key = Reflect.get(definition, NAME_KEY);

  if (typeof key !== "string") {
    throw new Error(
      `nuxvel: ${file} exports the definition ${String(Reflect.get(definition, NAMED_BY))} already exports; give each file its own, or export renamed(definition) to keep an old name`,
    );
  }

  Object.defineProperty(definition, NAME_KEY, { value: undefined });
  Object.defineProperty(definition, NAMED_BY, { value: file });
  Object.defineProperty(definition, key, { value: name, enumerable: true, writable: false, configurable: false });

  // the property was just set to name, which is what Named<> adds to the type
  return definition as Named<Definition, Name>;
}
