import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isBreakingStatement, migrationStatements, statementSummary } from "./contract-statements.ts";
import { hasJournal, readJournal } from "./pending-migrations.ts";

export interface MigrationFinding {
  tag: string;
  problem: string;
  hint: string;
}

const NAME = String.raw`((?:"(?:[^"]|"")+"|[\w$]+)(?:\.(?:"(?:[^"]|"")+"|[\w$]+))?)`;
const CREATE_TABLE = new RegExp(String.raw`^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?${NAME}`, "i");
const CREATE_INDEX = new RegExp(
  String.raw`^\s*CREATE\s+(?:UNIQUE\s+)?INDEX\s+(CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(?:${NAME}\s+)?ON\s+(?:ONLY\s+)?${NAME}`,
  "i",
);
const NO_TRANSACTION = /^--\s*nuxvel:no-transaction\s*$/m;

function baselineFile(migrationsFolder: string) {
  return join(migrationsFolder, "meta", "_nuxvel.json");
}

function tableName(name: string) {
  return name
    .split(".")
    .map((part) => (part.startsWith('"') ? part.slice(1, -1).replaceAll('""', '"') : part.toLowerCase()))
    .filter((part, index, parts) => !(parts.length === 2 && index === 0 && part === "public"))
    .join(".");
}

function withoutComments(statement: string) {
  return statement.replace(/^(?:\s*--[^\n]*\n?)*/, "");
}

function createdTables(statements: string[]) {
  return new Set(statements.flatMap((statement) => CREATE_TABLE.exec(statement)?.[1] ?? []).map(tableName));
}

export function isBlockingIndex(statement: string, migration: string[]) {
  const [, concurrently, , table = ""] = CREATE_INDEX.exec(withoutComments(statement)) ?? [];

  return table !== "" && !concurrently && !createdTables(migration.map(withoutComments)).has(tableName(table));
}

export function writeBaseline(migrationsFolder: string) {
  const tag = readJournal(migrationsFolder).at(-1)?.tag;

  if (tag) writeFileSync(baselineFile(migrationsFolder), `${JSON.stringify({ baseline: tag }, null, 2)}\n`);

  return tag;
}

function checkedMigrations(migrationsFolder: string) {
  const entries = readJournal(migrationsFolder);
  const file = baselineFile(migrationsFolder);
  const baseline: unknown = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")).baseline : undefined;
  const after = entries.findIndex((entry) => entry.tag === baseline);

  return entries.slice(after + 1);
}

export function unsafeMigrations(migrationsFolder: string): MigrationFinding[] {
  if (!hasJournal(migrationsFolder)) return [];

  return checkedMigrations(migrationsFolder).flatMap(({ tag }) => {
    const source = readFileSync(join(migrationsFolder, `${tag}.sql`), "utf8");
    const noTransaction = NO_TRANSACTION.test(source);
    const statements = migrationStatements(source).map(withoutComments);
    const findings: MigrationFinding[] = noTransaction && statements.length > 1
      ? [{
          tag,
          problem: `A -- nuxvel:no-transaction migration holds exactly one statement, this one holds ${statements.length}`,
          hint: "Put each statement in a migration of its own (nuxvel db:generate --custom)",
        }]
      : [];

    return findings.concat(statements.flatMap((statement): MigrationFinding[] => {
      const summary = statementSummary(statement);
      const index = CREATE_INDEX.exec(statement);

      if (index) {
        const [, concurrently, , table = ""] = index;

        if (concurrently && !noTransaction) {
          return [{
            tag,
            problem: `CREATE INDEX CONCURRENTLY cannot run in a transaction: ${summary}`,
            hint: "Put it alone in a migration whose first line is -- nuxvel:no-transaction",
          }];
        }
        if (isBlockingIndex(statement, statements)) {
          return [{
            tag,
            problem: `CREATE INDEX blocks the writes to ${tableName(table)} while it builds: ${summary}`,
            hint: "Build it with CREATE INDEX CONCURRENTLY, alone in a migration whose first line is -- nuxvel:no-transaction (nuxvel db:generate --custom)",
          }];
        }
        return [];
      }

      if (!isBreakingStatement(statement, statements)) return [];

      return [{
        tag,
        problem: `Breaking statement in an expand migration: ${summary}`,
        hint: `Move it to contract/${tag}.sql, which a deploy runs once no older release runs`,
      }];
    }));
  });
}
