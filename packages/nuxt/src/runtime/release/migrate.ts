import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runMigrations } from "../migrations/run-migrations";
import { ownerConnection } from "./owner-connection";
import { restrictAuditReads } from "./restrict-audit-reads";

function allowedContractMigrations() {
  return (process.env.NUXVEL_CONTRACT_MIGRATIONS ?? "").split(",").filter((tag) => tag !== "");
}

export async function runReleaseMigrations(migrationsFolder: URL) {
  const sql = ownerConnection("migrate");

  try {
    const result = await runMigrations(sql, {
      migrationsFolder: fileURLToPath(migrationsFolder),
      contract: allowedContractMigrations(),
    });

    await restrictAuditReads(sql, process.env.NUXT_DATABASE_URL);

    for (const tag of result.applied) console.log(`nuxvel migrate: applied ${tag}`);
    for (const tag of result.contract) console.log(`nuxvel migrate: applied the contract migration ${tag}`);
    for (const tag of result.deferred) console.log(`nuxvel migrate: deferred the contract migration ${tag}`);
    if (process.env.NUXVEL_MIGRATE_RESULT) writeFileSync(process.env.NUXVEL_MIGRATE_RESULT, JSON.stringify(result));
    console.log("nuxvel migrate: the database is up to date");
  } catch (error) {
    console.error("nuxvel migrate: could not apply the migrations");
    console.error(error);
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}
