import { findPgError } from "./find-pg-error";

const MIGRATION_HINT =
  "The database tables do not match the schema of the app. If you changed the schema, run nuxvel db:generate. Then run nuxvel db:migrate.";

export function migrationHint(error: unknown): string | undefined {
  if (!import.meta.dev) return undefined;

  return findPgError(error, "42P01") || findPgError(error, "42703") ? MIGRATION_HINT : undefined;
}
