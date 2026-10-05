import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface Migration {
  tag: string;
  when: number;
  source: string;
  hash: string;
}

export function readMigrations(migrationsFolder: string): Migration[] {
  const journalFile = join(migrationsFolder, "meta", "_journal.json");

  if (!existsSync(journalFile)) throw new Error(`No migrations journal at ${journalFile}`);

  const journal: { entries: { tag: string; when: number }[] } = JSON.parse(readFileSync(journalFile, "utf8"));

  return journal.entries.map(({ tag, when }) => {
    const source = readFileSync(join(migrationsFolder, `${tag}.sql`), "utf8");

    return { tag, when, source, hash: createHash("sha256").update(source).digest("hex") };
  });
}
