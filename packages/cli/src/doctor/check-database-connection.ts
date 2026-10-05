import postgres from "postgres";
import { describeDatabaseUrl } from "../database/describe-database-url.ts";
import { appSettings } from "./app-settings.ts";
import { type DoctorCheck, failed, passed, skipped } from "./doctor-check.ts";
import { errorMessage } from "../error-message.ts";

export const checkDatabaseConnection: DoctorCheck = {
  name: "database connection",
  async run({ cwd }) {
    const databaseUrl = (await appSettings(cwd)).NUXT_DATABASE_URL;
    if (!databaseUrl) return [skipped("NUXT_DATABASE_URL is not set")];

    const sql = postgres(databaseUrl, { max: 1 });

    try {
      await sql`select 1`;
      return [passed(describeDatabaseUrl(databaseUrl, "NUXT_DATABASE_URL"))];
    } catch (error) {
      return [
        failed(
          `could not connect to NUXT_DATABASE_URL: ${errorMessage(error)}`,
          "Start the database (nuxvel dev starts the app's services), or fix NUXT_DATABASE_URL",
        ),
      ];
    } finally {
      await sql.end();
    }
  },
};
