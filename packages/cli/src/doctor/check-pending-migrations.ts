import { changedMigrations } from "@nuxvel/nuxt/migrations";
import postgres from "postgres";
import { readMigrationsConfig } from "../database/migrations-config.ts";
import { CHANGED_MIGRATIONS_HINT, pendingMigrations } from "../database/pending-migrations.ts";
import { appSettings } from "./app-settings.ts";
import { type DoctorCheck, failed, passed, skipped, warning } from "./doctor-check.ts";
import { errorMessage } from "../error-message.ts";
import { plural } from "../ui/output.ts";

export const checkPendingMigrations: DoctorCheck = {
  name: "pending migrations",
  async run({ cwd }) {
    const databaseUrl = (await appSettings(cwd)).NUXT_DATABASE_URL;
    if (!databaseUrl) return [skipped("NUXT_DATABASE_URL is not set")];

    const sql = postgres(databaseUrl, { max: 1 });

    try {
      const config = await readMigrationsConfig(cwd);
      const changed = (await changedMigrations(sql, config)).map((change) => failed(change, CHANGED_MIGRATIONS_HINT));
      const pending = await pendingMigrations(sql, config);

      if (pending.length === 0) return changed.length > 0 ? changed : [passed("none pending")];

      return [...changed, warning(plural(pending.length, "pending migration"), "Run nuxvel db:migrate")];
    } catch (error) {
      return [failed(`could not check pending migrations: ${errorMessage(error)}`)];
    } finally {
      await sql.end();
    }
  },
};
