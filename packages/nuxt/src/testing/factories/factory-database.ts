import type { PgDatabase } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import { testDatabase } from "../database";

type FactoryDatabase = Pick<PgDatabase<PostgresJsQueryResultHKT>, "insert" | "execute">;

type DatabaseGetter = (options?: { root?: boolean }) => FactoryDatabase;

let appDatabase: DatabaseGetter | undefined;

/**
 * Points every {@link defineFactory} factory and {@link sequence} at the
 * app's database, as `db` returns it, instead of the test database.
 *
 * @internal The seeder runtime calls it with `useDb` before it runs a
 * seeder, so factory rows join the seeder's transaction; not meant for
 * app code.
 */
export function configureFactories(options: { db: DatabaseGetter }) {
  appDatabase = options.db;
}

export function factoryDatabase(options?: { root?: boolean }): FactoryDatabase {
  return appDatabase?.(options) ?? testDatabase();
}
