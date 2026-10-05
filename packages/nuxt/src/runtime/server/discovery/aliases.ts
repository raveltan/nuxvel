import { type Renamed, isRenamed } from "./renamed";

/** The definitions among a registry's entries, its {@link renamed} aliases left out. */
export type Defined<Entry> = Exclude<Entry, Renamed>;

type Named = { readonly name: string };

export function definitionsIn<Entry>(entries: readonly Entry[]): Defined<Entry>[] {
  return entries.filter((entry): entry is Defined<Entry> => !isRenamed(entry));
}

export function aliasesIn<Entry>(entries: readonly Entry[]): Extract<Entry, Renamed>[] {
  return entries.filter((entry): entry is Extract<Entry, Renamed> => isRenamed(entry));
}

export function resolveName<Definition extends Named>(
  entries: readonly (Definition | Renamed<Definition>)[],
  name: string,
): Definition | undefined {
  const entry = entries.find((candidate) => candidate.name === name);

  return entry && isRenamed(entry) ? entry.renamedTo : entry;
}

export function storedName(entries: readonly unknown[], definition: Named): string {
  const [alias, ...more] = entries.filter(isRenamed).filter((candidate) => candidate.renamedTo === definition);

  if (more.length > 0) {
    throw new Error(
      `nuxvel: "${definition.name}" has more than one renamed() alias (${[alias, ...more].map((entry) => entry?.name).join(", ")}); keep only the one its data is stored under`,
    );
  }

  return alias?.name ?? definition.name;
}

export function refuseRenamed<Entry>(kind: string, entries: Entry[]): Defined<Entry>[] {
  const [alias] = aliasesIn(entries);

  if (alias) {
    throw new Error(
      `nuxvel: the ${kind} "${alias.name}" is a renamed() alias, but a ${kind} stores nothing under its name; delete the old file`,
    );
  }

  return definitionsIn(entries);
}
