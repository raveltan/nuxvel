import { hasJournal, readJournal } from "./pending-migrations.ts";
import type { MigrationFinding } from "./unsafe-migrations.ts";

const REGENERATE_HINT =
  "Delete this migration and its snapshot, then run nuxvel db:generate again on top of the migrations it now follows";

export function migrationOrderProblems(migrationsFolder: string): MigrationFinding[] {
  if (!hasJournal(migrationsFolder)) return [];

  const entries = readJournal(migrationsFolder);

  return entries.flatMap((entry, index): MigrationFinding[] => {
    const earlier = entries.slice(0, index);
    const newer = earlier.find((other) => other.when >= entry.when);
    const number = /^\d+/.exec(entry.tag)?.[0];
    const sameNumber = number === undefined ? undefined : earlier.find((other) => other.tag.startsWith(`${number}_`));

    return [
      ...(newer
        ? [{
            tag: entry.tag,
            problem: `Generated before ${newer.tag}, which comes first: a database that applied ${newer.tag} skips it`,
            hint: REGENERATE_HINT,
          }]
        : []),
      ...(sameNumber
        ? [{
            tag: entry.tag,
            problem: `Has the same number as ${sameNumber.tag}: two branches each generated a migration`,
            hint: REGENERATE_HINT,
          }]
        : []),
    ];
  });
}
