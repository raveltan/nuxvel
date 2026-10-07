import type { Seeder } from "../runtime/server/seeders/define-seeder";
import type { SeederName } from "../runtime/server/seeders/seeder-name";
import { callApp } from "./settled";

/**
 * Runs a {@link defineSeeder} seeder in the app under test, with the
 * seeders it calls, as `nuxvel db:seed <name>` does.
 *
 * The seeder's writes are in the database when the call resolves. A
 * seeder that throws rejects with its error, after its transaction rolled
 * back. It forgets the app cache after the seeders commit.
 *
 * @param seeder A {@link SeederName}, or the seeder's definition or its
 * stub from `#nuxvel/test-namespaces`; a name no seeder defines fails to
 * compile.
 *
 * @example
 * ```ts
 * await runSeeder("database");
 * await runSeeder($seeders.database);
 * await expectRow(userTable, { email: "demo@example.com" });
 * ```
 */
export async function runSeeder(seeder: SeederName | Seeder): Promise<void> {
  await callApp("run-seeder", { name: typeof seeder === "string" ? seeder : seeder.name });
}
