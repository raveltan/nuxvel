import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { migrationSql, migrationStatements } from "./contract-statements.ts";
import { journalFile } from "./pending-migrations.ts";
import { isBlockingIndex } from "./unsafe-migrations.ts";

interface Journal {
  entries: { idx: number; when: number; tag: string }[];
}

function snapshotFile(migrationsFolder: string, tag: string) {
  return join(migrationsFolder, "meta", `${tag.split("_")[0]}_snapshot.json`);
}

export function moveBlockingIndexes(migrationsFolder: string, tag: string) {
  const file = join(migrationsFolder, `${tag}.sql`);
  const statements = migrationStatements(readFileSync(file, "utf8"));
  const blocking = statements.filter((statement) => isBlockingIndex(statement, statements));

  if (blocking.length === 0) return [];

  const kept = statements.filter((statement) => !blocking.includes(statement));
  const journalPath = journalFile(migrationsFolder);
  const journal: Journal = JSON.parse(readFileSync(journalPath, "utf8"));
  const snapshot: { id: string } = JSON.parse(readFileSync(snapshotFile(migrationsFolder, tag), "utf8"));
  let prevId = snapshot.id;
  const name = tag.replace(/^\d+_/, "");

  writeFileSync(file, kept.length > 0 ? migrationSql(kept) : "");

  const tags = blocking.map((statement, position) => {
    const last = journal.entries.at(-1);
    const idx = (last?.idx ?? -1) + 1;
    const indexTag = `${String(idx).padStart(4, "0")}_${name}-index${position === 0 ? "" : `-${position + 1}`}`;
    const concurrent = statement.trim().replace(/^(CREATE\s+(?:UNIQUE\s+)?INDEX)\s+/i, "$1 CONCURRENTLY ");
    const id = randomUUID();

    writeFileSync(join(migrationsFolder, `${indexTag}.sql`), `-- nuxvel:no-transaction\n${concurrent}\n`);
    writeFileSync(snapshotFile(migrationsFolder, indexTag), `${JSON.stringify({ ...snapshot, id, prevId }, null, 2)}\n`);
    prevId = id;
    journal.entries.push({ ...last, idx, when: Math.max(Date.now(), (last?.when ?? 0) + 1), tag: indexTag });

    return indexTag;
  });

  writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`);

  return tags;
}
